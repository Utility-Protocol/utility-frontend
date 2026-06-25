import { describe, it, expect } from "vitest";
import {
  extractFrustumPlanes,
  sphereInFrustum,
  pointInFrustum,
  planeDistance,
  distance3D,
  normalizePlane,
} from "@/utils/frustum";

const IDENTITY = [
  1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1,
];

describe("extractFrustumPlanes", () => {
  it("derives the NDC cube from an identity matrix", () => {
    const planes = extractFrustumPlanes(IDENTITY);
    expect(planes).toHaveLength(6);
    // left: x >= -1  → a=1, d=1
    expect(planes[0]).toMatchObject({ a: 1, b: 0, c: 0, d: 1 });
    // right: x <= 1 → a=-1, d=1
    expect(planes[1]).toMatchObject({ a: -1, b: 0, c: 0, d: 1 });
    // near: z >= -1
    expect(planes[4]).toMatchObject({ a: 0, b: 0, c: 1, d: 1 });
  });
});

describe("sphereInFrustum / pointInFrustum (NDC cube)", () => {
  const planes = extractFrustumPlanes(IDENTITY);

  it("accepts a point at the origin", () => {
    expect(pointInFrustum(planes, { x: 0, y: 0, z: 0 })).toBe(true);
  });

  it("rejects a point outside the cube", () => {
    expect(pointInFrustum(planes, { x: 2, y: 0, z: 0 })).toBe(false);
  });

  it("keeps a sphere that straddles a face (conservative)", () => {
    expect(
      sphereInFrustum(planes, { center: { x: 1.4, y: 0, z: 0 }, radius: 0.5 })
    ).toBe(true);
  });

  it("rejects a sphere fully outside a face", () => {
    expect(
      sphereInFrustum(planes, { center: { x: 2, y: 0, z: 0 }, radius: 0.4 })
    ).toBe(false);
  });
});

describe("helpers", () => {
  it("normalizePlane yields a unit normal", () => {
    const p = normalizePlane({ a: 0, b: 3, c: 4, d: 10 });
    expect(Math.hypot(p.a, p.b, p.c)).toBeCloseTo(1, 10);
    expect(p.d).toBeCloseTo(2, 10);
  });

  it("planeDistance is positive on the interior side", () => {
    expect(planeDistance({ a: 1, b: 0, c: 0, d: 0 }, { x: 5, y: 0, z: 0 })).toBe(5);
  });

  it("distance3D is Euclidean", () => {
    expect(distance3D({ x: 0, y: 0, z: 0 }, { x: 3, y: 4, z: 0 })).toBe(5);
  });
});
