/**
 * Local equirectangular projection between `[lng, lat]` and meters.
 *
 * Edge bundling and Douglas-Peucker simplification need a metric space; over a
 * city-scale viewport an equirectangular projection around a reference latitude
 * is accurate to a fraction of a percent, which is plenty for decluttering and
 * geometry simplification.
 */

import type { LngLat } from "@/types/network";

/** Meters per degree of latitude (near-constant). */
const M_PER_DEG_LAT = 110_540;
/** Meters per degree of longitude at the equator. */
const M_PER_DEG_LNG = 111_320;

export interface Point2D {
  x: number;
  y: number;
}

/** Project lng/lat to local meters relative to a reference point. */
export function toLocalMeters(
  [lng, lat]: LngLat,
  ref: LngLat
): Point2D {
  const cosLat = Math.cos((ref[1] * Math.PI) / 180);
  return {
    x: (lng - ref[0]) * M_PER_DEG_LNG * cosLat,
    y: (lat - ref[1]) * M_PER_DEG_LAT,
  };
}

/** Inverse of {@link toLocalMeters}. */
export function fromLocalMeters({ x, y }: Point2D, ref: LngLat): LngLat {
  const cosLat = Math.cos((ref[1] * Math.PI) / 180) || 1e-12;
  return [x / (M_PER_DEG_LNG * cosLat) + ref[0], y / M_PER_DEG_LAT + ref[1]];
}

/** Euclidean distance between two metric points. */
export function dist2D(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Convert `[lng, lat]` to normalized Web Mercator `[0, 1]` — the coordinate
 * space Mapbox's custom-layer projection matrix (`u_matrix`) operates in.
 */
export function lngLatToMercator([lng, lat]: LngLat): Point2D {
  const x = (lng + 180) / 360;
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);
  const y = 0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI);
  return { x, y };
}

/**
 * Pick a reference point (centroid) for a set of edges/points so the projection
 * is centered on the data.
 */
export function centroid(points: LngLat[]): LngLat {
  if (points.length === 0) return [0, 0];
  let lng = 0;
  let lat = 0;
  for (const p of points) {
    lng += p[0];
    lat += p[1];
  }
  return [lng / points.length, lat / points.length];
}
