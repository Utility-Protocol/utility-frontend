/**
 * Spatial types and invariants for the Three.js 3D asset overlay.
 *
 * Assets (meters, valves, substations) are indexed in a QuadTree covering a
 * 100 km × 100 km region. Each frame the Mapbox camera is read, a view-frustum
 * is derived, and the tree returns the visible assets tagged with a
 * Level-of-Detail so detailed meshes can be swapped for impostor sprites at
 * distance.
 *
 * Coordinates here are in a local metric ("world") space — meters relative to
 * the region origin — not lat/lng. The camera-sync layer maps Mapbox mercator
 * coordinates into this space.
 */

/** A point in local world space (meters). */
export interface Coordinate3D {
  x: number;
  y: number;
  z: number;
}

/** Axis-aligned bounding box in world space. */
export interface AABB {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Bounding sphere used for aggregated frustum tests on internal nodes. */
export interface BoundingSphere {
  center: Coordinate3D;
  radius: number;
}

/**
 * A frustum plane in the form `ax + by + cz + d = 0` with the normal `(a,b,c)`
 * pointing toward the interior. A point is inside the half-space when
 * `a·x + b·y + c·z + d >= 0`.
 */
export interface FrustumPlane {
  a: number;
  b: number;
  c: number;
  d: number;
}

/** Discrete level-of-detail buckets. */
export enum LODLevel {
  /** Full detail mesh (GLTF). */
  Full = 0,
  /** Simplified mesh (box). */
  Simplified = 1,
  /** Impostor sprite. */
  Impostor = 2,
  /** Beyond the draw distance — not rendered. */
  Culled = 3,
}

export type AssetType = "meter" | "valve" | "substation";

/** A single placeable asset instance. */
export interface AssetInstance {
  id: string;
  type: AssetType;
  /** Position in world space (meters). */
  position: Coordinate3D;
  /** Y-axis rotation in radians. @default 0 */
  rotation?: number;
  /** Uniform scale. @default 1 */
  scale?: number;
}

/** An asset paired with the LOD it should render at this frame. */
export interface VisibleAsset {
  asset: AssetInstance;
  lod: LODLevel;
  /** Distance (m) from the camera to the asset. */
  distance: number;
}

/** Mapbox camera state read from `map.transform` each frame. */
export interface CameraState {
  /** Camera position in world space (meters). */
  position: Coordinate3D;
  longitude: number;
  latitude: number;
  /** Camera altitude (m). */
  altitude: number;
  /** Bearing / heading in degrees. */
  heading: number;
  /** Pitch in degrees. */
  pitch: number;
}

// --- Invariants -------------------------------------------------------------

/** LOD switch distances in meters (inclusive lower bound, exclusive upper). */
export const LOD_DISTANCES = {
  /** 0–100 m → full mesh. */
  full: 100,
  /** 100–300 m → simplified mesh. */
  simplified: 300,
  /** 300–500 m → impostor sprite. */
  impostor: 500,
} as const;

/** QuadTree covers a 100 km × 100 km region. */
export const REGION_SIZE_M = 100_000;
/** Maximum QuadTree subdivision depth. */
export const QUADTREE_MAX_DEPTH = 8;

/** Hard cap on drawable assets per viewport before batch culling. */
export const MAX_DRAWABLE_ASSETS = 20_000;
/** Batch-cull target once the cap is exceeded. */
export const BATCH_CULL_TARGET = 10_000;

/** GPU memory ceiling (bytes) before the overlay degrades its LOD distances. */
export const GPU_MEMORY_BUDGET_BYTES = 512 * 1024 * 1024;

/** The region's AABB centered on the origin. */
export function regionBounds(size: number = REGION_SIZE_M): AABB {
  const half = size / 2;
  return { minX: -half, minY: -half, maxX: half, maxY: half };
}
