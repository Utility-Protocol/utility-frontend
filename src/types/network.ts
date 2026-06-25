/**
 * Types and invariants for the utility-network custom Mapbox layer.
 *
 * The network is a dense planar graph of pipes / cables / conduits. Edges are
 * rendered with raw WebGL; Force-Directed Edge Bundling declutters overlap,
 * Douglas-Peucker simplifies geometry per zoom, and per-vertex colors encode
 * flow direction (hue) and load status (alpha).
 */

/** `[longitude, latitude]`. */
export type LngLat = [number, number];

export type FlowDirection = "forward" | "reverse" | "bidirectional";
export type LoadStatus = "nominal" | "overloaded" | "idle";

/** A network edge — a polyline with flow/load metadata. */
export interface NetworkEdge {
  id: string;
  /** Polyline vertices (≥ 2). For bundling, the endpoints are used. */
  geometry: LngLat[];
  flowDirection: FlowDirection;
  loadStatus: LoadStatus;
}

/** An edge after bundling: its control-point polyline. */
export interface BundledEdge {
  id: string;
  points: LngLat[];
  flowDirection: FlowDirection;
  loadStatus: LoadStatus;
}

/** Interleaved vertex data ready to upload to a GL buffer. */
export interface VertexData {
  /** Interleaved [x, y, r, g, b, a] per vertex (lng/lat for position). */
  interleaved: Float32Array;
  /** Line-segment indices (pairs) into the vertex array. */
  indices: Uint32Array;
  vertexCount: number;
}

// --- Invariants -------------------------------------------------------------

/** Edges in viewport before LOD simplification kicks in. */
export const MAX_VIEWPORT_EDGES = 50_000;
/** Target edge count after simplification. */
export const SIMPLIFY_TARGET_EDGES = 15_000;

/** FDEB parameters. */
export const FDEB = {
  maxIterations: 40,
  convergenceEpsilon: 0.001,
  /** Global spring constant. */
  springConstant: 0.1,
  /** Control points per edge (including endpoints). */
  subdivisions: 8,
  /** Edges are bundled when angle compatibility (|cosθ|) exceeds this. */
  compatibilityThreshold: 0.7,
} as const;

/** Douglas-Peucker epsilon (meters) by zoom. */
export const SIMPLIFY_EPSILON = {
  /** zoom ≤ 14. */
  low: 5,
  /** zoom ≥ 16. */
  high: 20,
} as const;

/** Per-vertex RGBA color, components in [0, 1]. */
export type RGBA = [number, number, number, number];

/** Flow direction → base hue. */
export const FLOW_COLOR: Record<FlowDirection, [number, number, number]> = {
  forward: [0.13, 0.45, 0.95], // blue
  reverse: [0.94, 0.27, 0.27], // red
  bidirectional: [0.13, 0.77, 0.37], // green
};

/** Load status → alpha. */
export const LOAD_ALPHA: Record<LoadStatus, number> = {
  nominal: 1.0,
  overloaded: 0.4,
  idle: 0.2,
};
