/**
 * Off-thread frustum culling. The worker owns the QuadTree so the per-frame
 * visibility query never blocks the render thread. It accepts a flat camera
 * view-projection matrix, extracts the frustum, queries the tree, and returns
 * the visible asset ids with their LOD levels.
 */

import { QuadTree, type LODDistances } from "@/components/map/lod/QuadTree";
import { extractFrustumPlanes } from "@/utils/frustum";
import type { AssetInstance, Coordinate3D, LODLevel } from "@/types/spatial";

export type FrustumCullRequest =
  | { type: "load"; assets: AssetInstance[] }
  | {
      type: "query";
      requestId: number;
      /** Column-major view-projection matrix (16 numbers). */
      viewProjection: number[];
      cameraPosition: Coordinate3D;
      lodDistances?: LODDistances;
      maxAssets?: number;
      cullTarget?: number;
    };

export interface VisibleAssetRef {
  id: string;
  lod: LODLevel;
  distance: number;
}

export type FrustumCullResponse =
  | { type: "loaded"; count: number }
  | { type: "result"; requestId: number; visible: VisibleAssetRef[] };

const worker = self as unknown as Worker;
const tree = new QuadTree();

worker.addEventListener("message", (event: MessageEvent<FrustumCullRequest>) => {
  const msg = event.data;

  if (msg.type === "load") {
    tree.clear();
    tree.insertAll(msg.assets);
    const response: FrustumCullResponse = { type: "loaded", count: tree.size };
    worker.postMessage(response);
    return;
  }

  if (msg.type === "query") {
    const planes = extractFrustumPlanes(msg.viewProjection);
    const visible = tree
      .queryFrustum(planes, {
        cameraPosition: msg.cameraPosition,
        lodDistances: msg.lodDistances,
        maxAssets: msg.maxAssets,
        cullTarget: msg.cullTarget,
      })
      .map((v) => ({ id: v.asset.id, lod: v.lod, distance: v.distance }));

    const response: FrustumCullResponse = {
      type: "result",
      requestId: msg.requestId,
      visible,
    };
    worker.postMessage(response);
  }
});
