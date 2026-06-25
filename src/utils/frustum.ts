/**
 * View-frustum math used by the QuadTree culling layer. Kept free of Three.js
 * so it can run in a Web Worker and be unit-tested without a WebGL context.
 *
 * Matrices are 16-element, column-major (matching `THREE.Matrix4.elements` and
 * WebGL), i.e. element (row r, col c) is `m[c * 4 + r]`.
 */

import type { BoundingSphere, Coordinate3D, FrustumPlane } from "@/types/spatial";

/** Normalize a plane so its normal `(a,b,c)` is unit length. */
export function normalizePlane(p: FrustumPlane): FrustumPlane {
  const len = Math.hypot(p.a, p.b, p.c) || 1;
  return { a: p.a / len, b: p.b / len, c: p.c / len, d: p.d / len };
}

/**
 * Extract the six frustum planes from a column-major view-projection matrix
 * (Gribb–Hartmann). Returned planes have inward-pointing normals: a point is
 * inside the frustum when it lies in the positive half-space of every plane.
 */
export function extractFrustumPlanes(m: ArrayLike<number>): FrustumPlane[] {
  // row(i) = [ m(i,0), m(i,1), m(i,2), m(i,3) ]
  const row = (i: number): [number, number, number, number] => [
    m[0 * 4 + i],
    m[1 * 4 + i],
    m[2 * 4 + i],
    m[3 * 4 + i],
  ];
  const [r0, r1, r2, r3] = [row(0), row(1), row(2), row(3)];

  const combine = (
    s: [number, number, number, number],
    t: [number, number, number, number],
    sign: 1 | -1
  ): FrustumPlane =>
    normalizePlane({
      a: s[0] + sign * t[0],
      b: s[1] + sign * t[1],
      c: s[2] + sign * t[2],
      d: s[3] + sign * t[3],
    });

  return [
    combine(r3, r0, 1), // left:   w + x
    combine(r3, r0, -1), // right:  w - x
    combine(r3, r1, 1), // bottom: w + y
    combine(r3, r1, -1), // top:    w - y
    combine(r3, r2, 1), // near:   w + z
    combine(r3, r2, -1), // far:    w - z
  ];
}

/** Signed distance from a point to a plane (positive = interior side). */
export function planeDistance(p: FrustumPlane, pt: Coordinate3D): number {
  return p.a * pt.x + p.b * pt.y + p.c * pt.z + p.d;
}

/**
 * Conservative sphere/frustum intersection: returns false only when the sphere
 * is fully outside at least one plane. May report a near-miss as inside (the
 * standard accept-or-maybe test for broad-phase culling).
 */
export function sphereInFrustum(
  planes: FrustumPlane[],
  sphere: BoundingSphere
): boolean {
  for (const plane of planes) {
    if (planeDistance(plane, sphere.center) < -sphere.radius) {
      return false;
    }
  }
  return true;
}

/** True when a point lies inside every frustum plane. */
export function pointInFrustum(
  planes: FrustumPlane[],
  point: Coordinate3D
): boolean {
  for (const plane of planes) {
    if (planeDistance(plane, point) < 0) return false;
  }
  return true;
}

/** Euclidean distance between two 3D points. */
export function distance3D(a: Coordinate3D, b: Coordinate3D): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
