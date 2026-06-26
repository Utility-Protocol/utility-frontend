/**
 * Pure slippy-map tile math + viewport trajectory prediction for the prefetch
 * scheduler. No DOM, IndexedDB or Mapbox dependencies, so it is fully testable.
 */

import {
  GRID_RADIUS,
  LOOKAHEAD_SECONDS,
  MAX_ZOOM,
  MIN_ZOOM,
  STALE_HEADING_DEG,
  TTL_MS,
  VELOCITY_THRESHOLD,
  ZOOM_LOOKAHEAD,
  type BBox,
  type GeoSample,
  type TileId,
  type TileMeta,
  type Viewport,
} from "@/types/tile";

const DEG2RAD = Math.PI / 180;
const M_PER_DEG_LAT = 111_320;

export function tileKey(z: number, x: number, y: number): string {
  return `${z}/${x}/${y}`;
}

export function tileIdKey(t: TileId): string {
  return tileKey(t.z, t.x, t.y);
}

export function parseTileKey(key: string): TileId {
  const [z, x, y] = key.split("/").map(Number);
  return { z, x, y };
}

const clampLat = (lat: number) => Math.min(85.05112878, Math.max(-85.05112878, lat));
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(z)));

/** Convert lng/lat to the slippy-map tile containing it at zoom `z`. */
export function lngLatToTile(lng: number, lat: number, z: number): TileId {
  const zoom = clampZoom(z);
  const n = 2 ** zoom;
  const latRad = clampLat(lat) * DEG2RAD;
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  const max = n - 1;
  return {
    z: zoom,
    x: Math.min(max, Math.max(0, x)),
    y: Math.min(max, Math.max(0, y)),
  };
}

/** Geographic bounds of a tile. */
export function tileBounds(t: TileId): BBox {
  const n = 2 ** t.z;
  const lngOf = (x: number) => (x / n) * 360 - 180;
  const latOf = (y: number) => {
    const r = Math.PI * (1 - (2 * y) / n);
    return (Math.atan(Math.sinh(r)) * 180) / Math.PI;
  };
  return {
    west: lngOf(t.x),
    east: lngOf(t.x + 1),
    north: latOf(t.y),
    south: latOf(t.y + 1),
  };
}

/** Smallest angular difference between two headings (degrees, 0–180). */
export function headingDelta(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/** Whether a heading change is large enough to cancel pending prefetches. */
export function isStaleHeading(prev: number, next: number): boolean {
  return headingDelta(prev, next) > STALE_HEADING_DEG;
}

/** Whether the operator is moving fast enough to warrant prefetching. */
export function shouldPrefetch(sample: GeoSample): boolean {
  return sample.speed !== null && sample.speed > VELOCITY_THRESHOLD;
}

/**
 * Project the operator's position forward along their heading at current speed.
 * Falls back to the current position when heading/speed are unknown.
 */
export function predictCenter(
  sample: GeoSample,
  lookaheadSeconds = LOOKAHEAD_SECONDS
): { lng: number; lat: number } {
  if (sample.heading === null || sample.speed === null || sample.speed <= 0) {
    return { lng: sample.lng, lat: sample.lat };
  }
  const distance = sample.speed * lookaheadSeconds; // meters
  const headingRad = sample.heading * DEG2RAD;
  const dLat = (distance * Math.cos(headingRad)) / M_PER_DEG_LAT;
  const cosLat = Math.cos(clampLat(sample.lat) * DEG2RAD) || 1e-9;
  const dLng = (distance * Math.sin(headingRad)) / (M_PER_DEG_LAT * cosLat);
  return { lng: sample.lng + dLng, lat: sample.lat + dLat };
}

/** Tile pyramid burst: 3×3 grid at current ± lookahead zoom levels. */
export function burstTiles(
  center: { lng: number; lat: number },
  zoom: number,
  gridRadius = GRID_RADIUS,
  zoomLookahead = ZOOM_LOOKAHEAD
): TileId[] {
  const tiles: TileId[] = [];
  const baseZoom = clampZoom(zoom);
  for (let z = baseZoom - zoomLookahead; z <= baseZoom + zoomLookahead; z++) {
    if (z < MIN_ZOOM || z > MAX_ZOOM) continue;
    const c = lngLatToTile(center.lng, center.lat, z);
    const max = 2 ** z - 1;
    for (let dx = -gridRadius; dx <= gridRadius; dx++) {
      for (let dy = -gridRadius; dy <= gridRadius; dy++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x < 0 || y < 0 || x > max || y > max) continue;
        tiles.push({ z, x, y });
      }
    }
  }
  return tiles;
}

/** Predicted bounding box covering the burst grid around the projected center. */
export function predictBBox(viewport: Viewport, sample: GeoSample): BBox {
  const center = predictCenter(sample);
  const tiles = burstTiles(center, viewport.zoom);
  // Use the base-zoom tiles for the bbox (the densest LOD).
  const baseZoom = clampZoom(viewport.zoom);
  const baseTiles = tiles.filter((t) => t.z === baseZoom);
  const source = baseTiles.length ? baseTiles : tiles;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const t of source) {
    const b = tileBounds(t);
    west = Math.min(west, b.west);
    east = Math.max(east, b.east);
    south = Math.min(south, b.south);
    north = Math.max(north, b.north);
  }
  return { west, south, east, north };
}

/** Zoom levels to burst (current ± lookahead, clamped). */
export function zoomLevelsFor(zoom: number, zoomLookahead = ZOOM_LOOKAHEAD): number[] {
  const base = clampZoom(zoom);
  const levels: number[] = [];
  for (let z = base - zoomLookahead; z <= base + zoomLookahead; z++) {
    if (z >= MIN_ZOOM && z <= MAX_ZOOM) levels.push(z);
  }
  return levels;
}

/** Every tile covering `bbox` at zoom `z`. */
export function tilesInBBox(bbox: BBox, z: number): TileId[] {
  const topLeft = lngLatToTile(bbox.west, bbox.north, z);
  const bottomRight = lngLatToTile(bbox.east, bbox.south, z);
  const tiles: TileId[] = [];
  const minX = Math.min(topLeft.x, bottomRight.x);
  const maxX = Math.max(topLeft.x, bottomRight.x);
  const minY = Math.min(topLeft.y, bottomRight.y);
  const maxY = Math.max(topLeft.y, bottomRight.y);
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) tiles.push({ z, x, y });
  }
  return tiles;
}

/** TTL (ms) for a tile by its zoom. */
export function ttlForZoom(z: number): number {
  return z <= 14 ? TTL_MS.lowZoom : TTL_MS.highZoom;
}

/** Whether a cached tile has exceeded its zoom-dependent TTL. */
export function isStale(meta: TileMeta, now: number): boolean {
  return now - meta.fetchedAt > ttlForZoom(meta.z);
}
