/**
 * Types and invariants for the offline geospatial tile prefetch scheduler.
 *
 * The scheduler predicts the operator's viewport trajectory (GPS heading,
 * velocity, zoom delta), bursts the surrounding tile pyramid into IndexedDB, and
 * evicts under a bounded LRU policy that prefers the lowest
 * `access_count / age` ratio.
 */

/** A vector tile coordinate. */
export interface TileId {
  z: number;
  x: number;
  y: number;
}

/** Cached tile metadata (the blob itself lives in a separate store). */
export interface TileMeta {
  /** `z/x/y` key. */
  key: string;
  z: number;
  /** Approximate blob size in bytes. */
  size: number;
  /** When the tile was fetched (unix ms). */
  fetchedAt: number;
  /** Number of cache hits. */
  accessCount: number;
  /** Most recent access (unix ms). */
  lastAccess: number;
}

/** A GPS sample (1 Hz). */
export interface GeoSample {
  lng: number;
  lat: number;
  /** Heading in degrees (0 = north), or null when unknown. */
  heading: number | null;
  /** Speed in m/s, or null when unknown. */
  speed: number | null;
  timestamp: number;
}

/** Map viewport state. */
export interface Viewport {
  lng: number;
  lat: number;
  zoom: number;
  bearing: number;
  pitch: number;
}

/** Geographic bounding box. */
export interface BBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** A prefetch request emitted toward the worker. */
export interface PrefetchRequest {
  /** Predicted bounding box to cover. */
  bbox: BBox;
  /** Zoom levels to burst (current ± lookahead). */
  zoomLevels: number[];
  /** Monotonic request id (lets the worker cancel superseded bursts). */
  requestId: number;
}

// --- Invariants -------------------------------------------------------------

/** Hard cap on cached tile entries. */
export const TILE_CACHE_CAPACITY = 2500;
/** Eviction kicks in at this fill level. */
export const EVICTION_THRESHOLD = 2250;
/** Tiles evicted per eviction pass (down toward a comfortable margin). */
export const EVICTION_BATCH = TILE_CACHE_CAPACITY - EVICTION_THRESHOLD;
/** Writes between eviction checks. */
export const WRITE_CHECK_INTERVAL = 10;

/** Predictive window: 3×3 grid at each of current ±2 zoom levels (45 tiles). */
export const GRID_RADIUS = 1; // 3×3
export const ZOOM_LOOKAHEAD = 2; // ±2 levels

/** Velocity (m/s) above which prefetch is triggered. */
export const VELOCITY_THRESHOLD = 2;
/** Heading change (degrees) that cancels pending requests. */
export const STALE_HEADING_DEG = 30;
/** Seconds of lookahead used to project the predicted center. */
export const LOOKAHEAD_SECONDS = 10;

/** Stale-tile TTLs by zoom. */
export const TTL_MS = {
  /** zoom ≤ 14. */
  lowZoom: 7 * 24 * 60 * 60 * 1000,
  /** zoom ≥ 15. */
  highZoom: 48 * 60 * 60 * 1000,
} as const;

/** Mapbox max zoom for vector tiles. */
export const MAX_ZOOM = 22;
export const MIN_ZOOM = 0;
