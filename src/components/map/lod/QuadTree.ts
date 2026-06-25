/**
 * QuadTree spatial index for the 3D asset overlay.
 *
 * The 100 km × 100 km region is recursively subdivided into four quadrants (up
 * to {@link QUADTREE_MAX_DEPTH} levels). Leaf nodes hold asset references;
 * every node tracks the aggregated 3D extent of its subtree so a frustum query
 * can reject whole branches with a single bounding-sphere test. Visible assets
 * are returned tagged with a Level-of-Detail derived from camera distance.
 *
 * Pure data structure — no Three.js — so it can run inside a Web Worker.
 */

import {
  BATCH_CULL_TARGET,
  LODLevel,
  LOD_DISTANCES,
  MAX_DRAWABLE_ASSETS,
  QUADTREE_MAX_DEPTH,
  regionBounds,
  type AABB,
  type AssetInstance,
  type BoundingSphere,
  type Coordinate3D,
  type FrustumPlane,
  type VisibleAsset,
} from "@/types/spatial";
import { distance3D, sphereInFrustum } from "@/utils/frustum";

/** Leaf capacity before a node subdivides (while under the depth cap). */
const NODE_CAPACITY = 16;

export interface LODDistances {
  full: number;
  simplified: number;
  impostor: number;
}

/** Select the LOD bucket for a camera distance (meters). */
export function getLODLevel(
  distance: number,
  distances: LODDistances = LOD_DISTANCES
): LODLevel {
  if (distance < distances.full) return LODLevel.Full;
  if (distance < distances.simplified) return LODLevel.Simplified;
  if (distance < distances.impostor) return LODLevel.Impostor;
  return LODLevel.Culled;
}

export interface QueryOptions {
  cameraPosition: Coordinate3D;
  /** Override LOD switch distances (e.g. the memory watchdog degrading them). */
  lodDistances?: LODDistances;
  /** Cap before batch culling. @default MAX_DRAWABLE_ASSETS */
  maxAssets?: number;
  /** Batch-cull target once the cap is exceeded. @default BATCH_CULL_TARGET */
  cullTarget?: number;
}

class QuadNode {
  children: QuadNode[] | null = null;
  assets: AssetInstance[] = [];
  count = 0;
  // Aggregated 3D extent of every asset in this subtree.
  private minX = Infinity;
  private minY = Infinity;
  private minZ = Infinity;
  private maxX = -Infinity;
  private maxY = -Infinity;
  private maxZ = -Infinity;

  constructor(readonly bounds: AABB, readonly depth: number) {}

  expand(p: Coordinate3D): void {
    this.count += 1;
    if (p.x < this.minX) this.minX = p.x;
    if (p.y < this.minY) this.minY = p.y;
    if (p.z < this.minZ) this.minZ = p.z;
    if (p.x > this.maxX) this.maxX = p.x;
    if (p.y > this.maxY) this.maxY = p.y;
    if (p.z > this.maxZ) this.maxZ = p.z;
  }

  /** Bounding sphere of the aggregated extent (empty → radius 0 at origin). */
  boundingSphere(): BoundingSphere {
    if (this.count === 0) {
      return { center: { x: 0, y: 0, z: 0 }, radius: 0 };
    }
    const center = {
      x: (this.minX + this.maxX) / 2,
      y: (this.minY + this.maxY) / 2,
      z: (this.minZ + this.maxZ) / 2,
    };
    const radius =
      0.5 *
      Math.hypot(
        this.maxX - this.minX,
        this.maxY - this.minY,
        this.maxZ - this.minZ
      );
    return { center, radius };
  }
}

export class QuadTree {
  private root: QuadNode;
  private readonly bounds: AABB;
  private _size = 0;

  constructor(
    bounds: AABB = regionBounds(),
    private readonly maxDepth: number = QUADTREE_MAX_DEPTH
  ) {
    this.bounds = bounds;
    this.root = new QuadNode(bounds, 0);
  }

  /** Total inserted assets. */
  get size(): number {
    return this._size;
  }

  /** Insert an asset, subdividing leaves that exceed capacity. */
  insert(asset: AssetInstance): void {
    this.insertInto(this.root, asset);
    this._size += 1;
  }

  /** Insert many assets. */
  insertAll(assets: Iterable<AssetInstance>): void {
    for (const a of assets) this.insert(a);
  }

  private insertInto(node: QuadNode, asset: AssetInstance): void {
    node.expand(asset.position);

    if (node.children) {
      this.insertInto(this.childFor(node, asset.position), asset);
      return;
    }

    node.assets.push(asset);
    if (node.assets.length > NODE_CAPACITY && node.depth < this.maxDepth) {
      this.subdivide(node);
    }
  }

  private subdivide(node: QuadNode): void {
    const { minX, minY, maxX, maxY } = node.bounds;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const d = node.depth + 1;
    // Order: SW, SE, NW, NE (matches childFor's index math).
    node.children = [
      new QuadNode({ minX, minY, maxX: midX, maxY: midY }, d),
      new QuadNode({ minX: midX, minY, maxX, maxY: midY }, d),
      new QuadNode({ minX, minY: midY, maxX: midX, maxY }, d),
      new QuadNode({ minX: midX, minY: midY, maxX, maxY }, d),
    ];
    const pending = node.assets;
    node.assets = [];
    for (const a of pending) {
      this.insertInto(this.childFor(node, a.position), a);
    }
  }

  private childFor(node: QuadNode, p: Coordinate3D): QuadNode {
    const { minX, minY, maxX, maxY } = node.bounds;
    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;
    const east = p.x >= midX ? 1 : 0;
    const north = p.y >= midY ? 1 : 0;
    return node.children![north * 2 + east];
  }

  /**
   * Return the assets visible within `planes`, each tagged with a LOD level.
   * Branches whose bounding sphere lies wholly outside the frustum are skipped.
   * When the result exceeds `maxAssets`, the nearest `cullTarget` are kept.
   */
  queryFrustum(planes: FrustumPlane[], options: QueryOptions): VisibleAsset[] {
    const {
      cameraPosition,
      lodDistances = LOD_DISTANCES,
      maxAssets = MAX_DRAWABLE_ASSETS,
      cullTarget = BATCH_CULL_TARGET,
    } = options;

    const results: VisibleAsset[] = [];
    this.queryNode(this.root, planes, cameraPosition, lodDistances, results);

    if (results.length > maxAssets) {
      // Density too high: keep the nearest assets (off-screen already removed).
      results.sort((a, b) => a.distance - b.distance);
      results.length = cullTarget;
    }
    return results;
  }

  private queryNode(
    node: QuadNode,
    planes: FrustumPlane[],
    camera: Coordinate3D,
    distances: LODDistances,
    out: VisibleAsset[]
  ): void {
    if (node.count === 0) return;
    if (!sphereInFrustum(planes, node.boundingSphere())) return;

    if (node.children) {
      for (const child of node.children) {
        this.queryNode(child, planes, camera, distances, out);
      }
      return;
    }

    for (const asset of node.assets) {
      const distance = distance3D(camera, asset.position);
      const lod = getLODLevel(distance, distances);
      if (lod !== LODLevel.Culled) {
        out.push({ asset, lod, distance });
      }
    }
  }

  /** Remove all assets. */
  clear(): void {
    this.root = new QuadNode(this.bounds, 0);
    this._size = 0;
  }
}
