/**
 * Zoom-aware Douglas-Peucker simplification for network edge geometry.
 *
 * Simplification runs in local metric space (so the epsilon is in meters) and
 * the result is reprojected to `[lng, lat]`. Epsilon is 5 m at zoom ≤ 14 and
 * 20 m at zoom ≥ 16, interpolated between.
 */

import { SIMPLIFY_EPSILON, type LngLat, type NetworkEdge } from "@/types/network";
import { centroid, fromLocalMeters, toLocalMeters, type Point2D } from "@/utils/geo";

/** Douglas-Peucker epsilon (meters) for a zoom level. */
export function zoomEpsilon(zoom: number): number {
  const { low, high } = SIMPLIFY_EPSILON;
  if (zoom <= 14) return low;
  if (zoom >= 16) return high;
  // Linear interpolation across the 14–16 band.
  return low + ((high - low) * (zoom - 14)) / 2;
}

/** Perpendicular distance from `p` to the segment `a→b` (meters). */
export function perpendicularDistance(p: Point2D, a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  // Distance from point to the infinite line through a,b.
  const cross = Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x);
  return cross / Math.sqrt(lenSq);
}

/** Simplify a metric polyline with Douglas-Peucker. */
export function douglasPeucker(points: Point2D[], epsilon: number): Point2D[] {
  if (points.length <= 2) return points.slice();

  let maxDist = 0;
  let index = 0;
  const first = points[0];
  const last = points[points.length - 1];
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      index = i;
    }
  }

  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, index + 1), epsilon);
    const right = douglasPeucker(points.slice(index), epsilon);
    // Drop the duplicated join point.
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/** Simplify one edge's geometry at the given metric epsilon. */
export function simplifyGeometry(
  geometry: LngLat[],
  epsilonMeters: number,
  ref: LngLat
): LngLat[] {
  if (geometry.length <= 2) return geometry.slice();
  const metric = geometry.map((c) => toLocalMeters(c, ref));
  const simplified = douglasPeucker(metric, epsilonMeters);
  return simplified.map((p) => fromLocalMeters(p, ref));
}

/**
 * Simplify a set of edges with a zoom-derived epsilon. The projection is
 * centered on the edges' centroid so the metric error stays small.
 */
export function simplifyEdges(
  edges: NetworkEdge[],
  zoom: number
): NetworkEdge[] {
  if (edges.length === 0) return [];
  const epsilon = zoomEpsilon(zoom);
  const ref = centroid(edges.flatMap((e) => e.geometry));
  return edges.map((e) => ({
    ...e,
    geometry: simplifyGeometry(e.geometry, epsilon, ref),
  }));
}
