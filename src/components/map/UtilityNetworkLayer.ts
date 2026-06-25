/**
 * Mapbox GL JS custom layer rendering a dense utility network with raw WebGL.
 *
 * Mapbox's native line layer saturates draw calls past ~10k edges; this layer
 * uploads the whole network into a single interleaved vertex buffer and draws it
 * with one `gl.LINES` call, transformed by the Mapbox projection matrix
 * (`u_matrix`) in normalized mercator space. Per-vertex colors encode flow
 * direction (hue) and load status (alpha). Geometry is bundled (FDEB) and
 * simplified (Douglas-Peucker) before upload.
 *
 * Implements the structural `CustomLayerInterface` (onAdd / render / prerender /
 * onRemove) without taking a hard dependency on `mapbox-gl`.
 */

import {
  FLOW_COLOR,
  LOAD_ALPHA,
  type BundledEdge,
  type LngLat,
  type NetworkEdge,
  type RGBA,
  type VertexData,
} from "@/types/network";
import { lngLatToMercator } from "@/utils/geo";
import { simplifyEdges } from "@/utils/edgeSimplification";
import { bundleEdges } from "@/utils/edgeBundling";

/** Minimal structural view of the bits of the Mapbox map we use. */
export interface MapForLayer {
  getZoom(): number;
  triggerRepaint(): void;
}

export interface CustomLayerLike {
  id: string;
  type: "custom";
  renderingMode?: "2d" | "3d";
  onAdd(map: MapForLayer, gl: WebGLRenderingContext): void;
  render(gl: WebGLRenderingContext, matrix: number[]): void;
  prerender?(gl: WebGLRenderingContext, matrix: number[]): void;
  onRemove(map: MapForLayer, gl: WebGLRenderingContext): void;
}

const FLOATS_PER_VERTEX = 6; // x, y, r, g, b, a
const MAX_LINE_WIDTH = 4.0;

type DrawableEdge = Pick<BundledEdge, "flowDirection" | "loadStatus"> & {
  points: LngLat[];
};

/** RGBA color for an edge: hue from flow direction, alpha from load status. */
export function edgeColor(edge: {
  flowDirection: NetworkEdge["flowDirection"];
  loadStatus: NetworkEdge["loadStatus"];
}): RGBA {
  const [r, g, b] = FLOW_COLOR[edge.flowDirection];
  return [r, g, b, LOAD_ALPHA[edge.loadStatus]];
}

/**
 * Build an interleaved vertex buffer and a line-segment index buffer from a set
 * of edges. Positions are normalized mercator coordinates; colors are baked per
 * vertex. Pure — unit-tested without a GL context.
 */
export function buildVertexData(edges: DrawableEdge[]): VertexData {
  const vertexCount = edges.reduce((n, e) => n + e.points.length, 0);
  const interleaved = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
  const indexPairs: number[] = [];

  let v = 0;
  for (const edge of edges) {
    const [r, g, b, a] = edgeColor(edge);
    const startVertex = v;
    for (let i = 0; i < edge.points.length; i++) {
      const { x, y } = lngLatToMercator(edge.points[i]);
      const o = v * FLOATS_PER_VERTEX;
      interleaved[o] = x;
      interleaved[o + 1] = y;
      interleaved[o + 2] = r;
      interleaved[o + 3] = g;
      interleaved[o + 4] = b;
      interleaved[o + 5] = a;
      if (i > 0) indexPairs.push(v - 1, v);
      v++;
    }
    void startVertex;
  }

  return {
    interleaved,
    indices: new Uint32Array(indexPairs),
    vertexCount,
  };
}

const VERTEX_SHADER = `
precision highp float;
uniform mat4 u_matrix;
attribute vec2 a_pos;   // normalized mercator
attribute vec4 a_color; // per-vertex rgba
varying vec4 v_color;
void main() {
  v_color = a_color;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec4 v_color;
uniform float u_opacity;
void main() {
  gl_FragColor = vec4(v_color.rgb, v_color.a * u_opacity);
}`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Failed to create shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return shader;
}

export interface UtilityNetworkLayerOptions {
  id?: string;
  /** Re-simplify/re-bundle when the integer zoom changes. @default true */
  zoomAware?: boolean;
  lineWidth?: number;
  opacity?: number;
}

/**
 * The custom layer. Construct with the edge set; `onAdd`/`render`/`onRemove` are
 * driven by Mapbox. Call {@link setEdges} (e.g. from a Redux toggle) to re-bind
 * the vertex buffer after a visibility/status-filter change.
 */
export class UtilityNetworkLayer implements CustomLayerLike {
  readonly id: string;
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;

  private map: MapForLayer | null = null;
  private gl: WebGLRenderingContext | null = null;
  private program: WebGLProgram | null = null;
  private vertexBuffer: WebGLBuffer | null = null;
  private indexBuffer: WebGLBuffer | null = null;
  private uMatrix: WebGLUniformLocation | null = null;
  private uOpacity: WebGLUniformLocation | null = null;
  private aPos = -1;
  private aColor = -1;

  private edges: NetworkEdge[];
  private vertexData: VertexData = {
    interleaved: new Float32Array(0),
    indices: new Uint32Array(0),
    vertexCount: 0,
  };
  private lastZoomBucket = NaN;
  private readonly opts: Required<UtilityNetworkLayerOptions>;

  constructor(edges: NetworkEdge[], options: UtilityNetworkLayerOptions = {}) {
    this.edges = edges;
    this.opts = {
      id: options.id ?? "utility-network",
      zoomAware: options.zoomAware ?? true,
      lineWidth: Math.min(options.lineWidth ?? 1.5, MAX_LINE_WIDTH),
      opacity: options.opacity ?? 1.0,
    };
    this.id = this.opts.id;
  }

  /** Replace the edge set and re-upload the buffer (if already added). */
  setEdges(edges: NetworkEdge[]): void {
    this.edges = edges;
    this.lastZoomBucket = NaN; // force a rebuild
    if (this.gl && this.map) {
      this.rebuild(this.map.getZoom());
      this.map.triggerRepaint();
    }
  }

  /** Process edges for the given zoom: simplify → bundle → vertex data. */
  private processEdges(zoom: number): DrawableEdge[] {
    const simplified = simplifyEdges(this.edges, zoom);
    return bundleEdges(simplified);
  }

  private rebuild(zoom: number): void {
    const drawable = this.opts.zoomAware
      ? this.processEdges(zoom)
      : this.edges.map((e) => ({
          points: e.geometry,
          flowDirection: e.flowDirection,
          loadStatus: e.loadStatus,
        }));
    this.vertexData = buildVertexData(drawable);
    this.uploadBuffers();
    this.lastZoomBucket = Math.floor(zoom);
  }

  private uploadBuffers(): void {
    const gl = this.gl;
    if (!gl || !this.vertexBuffer || !this.indexBuffer) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.interleaved, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(
      gl.ELEMENT_ARRAY_BUFFER,
      this.vertexData.indices,
      gl.DYNAMIC_DRAW
    );
  }

  onAdd(map: MapForLayer, gl: WebGLRenderingContext): void {
    this.map = map;
    this.gl = gl;

    const program = gl.createProgram();
    if (!program) throw new Error("Failed to create program");
    const vert = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const frag = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    this.program = program;

    this.uMatrix = gl.getUniformLocation(program, "u_matrix");
    this.uOpacity = gl.getUniformLocation(program, "u_opacity");
    this.aPos = gl.getAttribLocation(program, "a_pos");
    this.aColor = gl.getAttribLocation(program, "a_color");

    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();

    this.rebuild(map.getZoom());
  }

  /** Re-simplify/bundle when the integer zoom changes (cheap broad-phase). */
  prerender(_gl: WebGLRenderingContext, _matrix: number[]): void {
    if (!this.opts.zoomAware || !this.map) return;
    const bucket = Math.floor(this.map.getZoom());
    if (bucket !== this.lastZoomBucket) {
      this.rebuild(this.map.getZoom());
    }
  }

  render(gl: WebGLRenderingContext, matrix: number[]): void {
    if (!this.program || this.vertexData.vertexCount === 0) return;

    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.uMatrix, false, matrix);
    if (this.uOpacity) gl.uniform1f(this.uOpacity, this.opts.opacity);

    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    const stride = FLOATS_PER_VERTEX * 4;
    gl.enableVertexAttribArray(this.aPos);
    gl.vertexAttribPointer(this.aPos, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(this.aColor);
    gl.vertexAttribPointer(this.aColor, 4, gl.FLOAT, false, stride, 2 * 4);

    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.lineWidth(this.opts.lineWidth);
    gl.drawElements(
      gl.LINES,
      this.vertexData.indices.length,
      gl.UNSIGNED_INT,
      0
    );
  }

  onRemove(_map: MapForLayer, gl: WebGLRenderingContext): void {
    if (this.program) gl.deleteProgram(this.program);
    if (this.vertexBuffer) gl.deleteBuffer(this.vertexBuffer);
    if (this.indexBuffer) gl.deleteBuffer(this.indexBuffer);
    this.program = null;
    this.vertexBuffer = null;
    this.indexBuffer = null;
    this.gl = null;
    this.map = null;
  }
}
