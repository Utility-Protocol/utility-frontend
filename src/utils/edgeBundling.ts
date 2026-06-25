/**
 * Force-Directed Edge Bundling (FDEB), after Holten & van Wijk.
 *
 * Each edge is subdivided into control points; compatible edges (similar angle,
 * scale and position) attract each other's corresponding control points while a
 * spring force keeps each edge smooth. Endpoints stay pinned. Running this on a
 * dense planar utility graph declutters overlapping runs into visible bundles.
 *
 * Works in a normalized metric space (meters / average edge length) so the
 * convergence epsilon is scale-independent.
 */

import { FDEB, type BundledEdge, type LngLat, type NetworkEdge } from "@/types/network";
import {
  centroid,
  dist2D,
  fromLocalMeters,
  toLocalMeters,
  type Point2D,
} from "@/utils/geo";

export interface CompatibilityScore {
  angle: number;
  scale: number;
  position: number;
  total: number;
}

function len(p: Point2D, q: Point2D): number {
  return Math.hypot(q.x - p.x, q.y - p.y);
}
function mid(p: Point2D, q: Point2D): Point2D {
  return { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
}

/** Compatibility between two straight segments (angle, scale, position). */
export function edgeCompatibility(
  a0: Point2D,
  a1: Point2D,
  b0: Point2D,
  b1: Point2D
): CompatibilityScore {
  const lenA = len(a0, a1) || 1e-9;
  const lenB = len(b0, b1) || 1e-9;
  const dot = (a1.x - a0.x) * (b1.x - b0.x) + (a1.y - a0.y) * (b1.y - b0.y);

  const angle = Math.abs(dot) / (lenA * lenB);
  const lavg = (lenA + lenB) / 2;
  const scale =
    2 / (lavg / Math.min(lenA, lenB) + Math.max(lenA, lenB) / lavg);
  const position = lavg / (lavg + dist2D(mid(a0, a1), mid(b0, b1)));

  return { angle, scale, position, total: angle * scale * position };
}

/** Evenly spaced control points (inclusive of endpoints). */
export function subdivide(from: Point2D, to: Point2D, n: number): Point2D[] {
  const points: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    points.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
  }
  return points;
}

export interface BundleParams {
  subdivisions: number;
  maxIterations: number;
  springConstant: number;
  compatibilityThreshold: number;
  convergenceEpsilon: number;
}

const DEFAULT_PARAMS: BundleParams = {
  subdivisions: FDEB.subdivisions,
  maxIterations: FDEB.maxIterations,
  springConstant: FDEB.springConstant,
  compatibilityThreshold: FDEB.compatibilityThreshold,
  convergenceEpsilon: FDEB.convergenceEpsilon,
};

/**
 * Bundle a set of edges. Returns each edge's bundled control-point polyline in
 * `[lng, lat]`. Edge endpoints are preserved exactly.
 */
export function bundleEdges(
  edges: NetworkEdge[],
  params: Partial<BundleParams> = {}
): BundledEdge[] {
  const cfg = { ...DEFAULT_PARAMS, ...params };
  if (edges.length === 0) return [];

  const ref = centroid(edges.map((e) => e.geometry[0]));
  // Endpoints in metric space.
  const segments = edges.map((e) => ({
    from: toLocalMeters(e.geometry[0], ref),
    to: toLocalMeters(e.geometry[e.geometry.length - 1], ref),
  }));

  // Normalize by the average edge length so the convergence epsilon is
  // scale-independent.
  const avgLen =
    segments.reduce((s, seg) => s + len(seg.from, seg.to), 0) /
      segments.length || 1;
  const norm = (p: Point2D): Point2D => ({ x: p.x / avgLen, y: p.y / avgLen });

  const n = cfg.subdivisions;
  let paths = segments.map((seg) => subdivide(norm(seg.from), norm(seg.to), n));

  // Precompute compatible-edge lists (angle compatibility ≥ threshold).
  const compatible: Array<Array<{ j: number; weight: number }>> = paths.map(() => []);
  for (let i = 0; i < segments.length; i++) {
    const a = paths[i];
    for (let j = i + 1; j < segments.length; j++) {
      const b = paths[j];
      const score = edgeCompatibility(a[0], a[n - 1], b[0], b[n - 1]);
      if (score.angle >= cfg.compatibilityThreshold) {
        compatible[i].push({ j, weight: score.total });
        compatible[j].push({ j: i, weight: score.total });
      }
    }
  }

  // Iterate spring + compatibility-attraction forces on the interior points.
  for (let iter = 0; iter < cfg.maxIterations; iter++) {
    const step = 0.4 * (1 - iter / cfg.maxIterations);
    const next = paths.map((p) => p.map((pt) => ({ ...pt })));
    let maxDisp = 0;

    for (let e = 0; e < paths.length; e++) {
      const path = paths[e];
      const partners = compatible[e];
      const partnerCount = partners.length || 1;

      for (let i = 1; i < n - 1; i++) {
        const cur = path[i];
        // Spring force toward this edge's neighbouring control points.
        let fx = cfg.springConstant * (path[i - 1].x + path[i + 1].x - 2 * cur.x);
        let fy = cfg.springConstant * (path[i - 1].y + path[i + 1].y - 2 * cur.y);
        // Attraction toward compatible edges' matching control points.
        for (const { j, weight } of partners) {
          fx += (weight * (paths[j][i].x - cur.x)) / partnerCount;
          fy += (weight * (paths[j][i].y - cur.y)) / partnerCount;
        }
        const nx = cur.x + step * fx;
        const ny = cur.y + step * fy;
        next[e][i].x = nx;
        next[e][i].y = ny;
        const disp = Math.hypot(nx - cur.x, ny - cur.y);
        if (disp > maxDisp) maxDisp = disp;
      }
    }

    paths = next;
    if (maxDisp < cfg.convergenceEpsilon) break;
  }

  // Denormalize and reproject to lng/lat.
  return edges.map((edge, e) => ({
    id: edge.id,
    flowDirection: edge.flowDirection,
    loadStatus: edge.loadStatus,
    points: paths[e].map((p) =>
      fromLocalMeters({ x: p.x * avgLen, y: p.y * avgLen }, ref)
    ) as LngLat[],
  }));
}
