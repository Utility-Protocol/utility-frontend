import { describe, it, expect } from "vitest";
import { QuadTree, getLODLevel } from "@/components/map/lod/QuadTree";
import { LODLevel, type AssetInstance, type FrustumPlane } from "@/types/spatial";

let counter = 0;
function asset(x: number, y: number, z = 0): AssetInstance {
  return { id: `a${counter++}`, type: "meter", position: { x, y, z } };
}

/** Empty plane set → every node passes the frustum test (isolates LOD logic). */
const ACCEPT_ALL: FrustumPlane[] = [];

describe("getLODLevel", () => {
  it("buckets by distance", () => {
    expect(getLODLevel(0)).toBe(LODLevel.Full);
    expect(getLODLevel(99)).toBe(LODLevel.Full);
    expect(getLODLevel(100)).toBe(LODLevel.Simplified);
    expect(getLODLevel(299)).toBe(LODLevel.Simplified);
    expect(getLODLevel(300)).toBe(LODLevel.Impostor);
    expect(getLODLevel(499)).toBe(LODLevel.Impostor);
    expect(getLODLevel(500)).toBe(LODLevel.Culled);
  });

  it("honours degraded distances", () => {
    const degraded = { full: 50, simplified: 200, impostor: 500 };
    expect(getLODLevel(60, degraded)).toBe(LODLevel.Simplified);
  });
});

describe("QuadTree insert", () => {
  it("tracks size", () => {
    const tree = new QuadTree();
    tree.insert(asset(0, 0));
    tree.insertAll([asset(10, 10), asset(-20, -20)]);
    expect(tree.size).toBe(3);
  });

  it("subdivides past leaf capacity without losing assets", () => {
    const tree = new QuadTree();
    for (let i = 0; i < 100; i++) tree.insert(asset(i, i));
    const visible = tree.queryFrustum(ACCEPT_ALL, {
      cameraPosition: { x: 50, y: 50, z: 0 },
      lodDistances: { full: 1e9, simplified: 1e9, impostor: 1e9 },
    });
    expect(visible).toHaveLength(100);
  });
});

describe("QuadTree.queryFrustum LOD", () => {
  it("tags assets by camera distance and culls beyond 500 m", () => {
    const tree = new QuadTree();
    tree.insert(asset(50, 0)); // 50 m → Full
    tree.insert(asset(200, 0)); // 200 m → Simplified
    tree.insert(asset(400, 0)); // 400 m → Impostor
    tree.insert(asset(600, 0)); // 600 m → culled (excluded)

    const visible = tree.queryFrustum(ACCEPT_ALL, {
      cameraPosition: { x: 0, y: 0, z: 0 },
    });
    const byDist = visible.sort((a, b) => a.distance - b.distance);
    expect(byDist.map((v) => v.lod)).toEqual([
      LODLevel.Full,
      LODLevel.Simplified,
      LODLevel.Impostor,
    ]);
  });

  it("excludes assets outside the frustum", () => {
    const tree = new QuadTree();
    tree.insert(asset(100, 100));
    // Plane: x - 1e9 >= 0 → everything is outside.
    const reject: FrustumPlane[] = [{ a: 1, b: 0, c: 0, d: -1e9 }];
    expect(
      tree.queryFrustum(reject, { cameraPosition: { x: 0, y: 0, z: 0 } })
    ).toHaveLength(0);
  });
});

describe("QuadTree batch culling", () => {
  it("keeps the nearest cullTarget when over the cap", () => {
    const tree = new QuadTree();
    for (let i = 1; i <= 10; i++) tree.insert(asset(i, 0)); // 1..10 m away
    const visible = tree.queryFrustum(ACCEPT_ALL, {
      cameraPosition: { x: 0, y: 0, z: 0 },
      maxAssets: 5,
      cullTarget: 3,
    });
    expect(visible).toHaveLength(3);
    // The three nearest (1, 2, 3 m) survive.
    expect(visible.every((v) => v.distance <= 3)).toBe(true);
  });
});

describe("QuadTree clear", () => {
  it("resets and re-inserts correctly (no stale extent)", () => {
    const tree = new QuadTree();
    tree.insert(asset(40000, 40000));
    tree.clear();
    expect(tree.size).toBe(0);
    tree.insert(asset(10, 10));
    const visible = tree.queryFrustum(ACCEPT_ALL, {
      cameraPosition: { x: 10, y: 10, z: 0 },
    });
    expect(visible).toHaveLength(1);
    expect(visible[0].lod).toBe(LODLevel.Full);
  });
});
