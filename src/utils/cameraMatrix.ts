/**
 * Minimal column-major 4×4 camera matrix math (perspective, look-at, multiply)
 * plus a web-mercator meter projection. Kept Three.js-free so the view-frustum
 * derived here can be built and tested without a WebGL context — the QuadTree
 * culling layer consumes the resulting view-projection matrix directly.
 *
 * All matrices are 16-element, column-major (element (row r, col c) = m[c*4+r]).
 */

import type { Coordinate3D } from "@/types/spatial";

/** Earth radius (m) for the spherical web-mercator approximation. */
const EARTH_RADIUS_M = 6_378_137;

export type Mat4 = number[];

function normalize(v: Coordinate3D): Coordinate3D {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}
function cross(a: Coordinate3D, b: Coordinate3D): Coordinate3D {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}
function dot(a: Coordinate3D, b: Coordinate3D): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** Perspective projection (column-major). `fovY` in radians. */
export function perspective(
  fovY: number,
  aspect: number,
  near: number,
  far: number
): Mat4 {
  const f = 1 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  const m = new Array(16).fill(0);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/** Right-handed view matrix (gluLookAt), column-major. */
export function lookAt(
  eye: Coordinate3D,
  center: Coordinate3D,
  up: Coordinate3D
): Mat4 {
  const z = normalize({ x: eye.x - center.x, y: eye.y - center.y, z: eye.z - center.z });
  const x = normalize(cross(up, z));
  const y = cross(z, x);
  return [
    x.x, y.x, z.x, 0,
    x.y, y.y, z.y, 0,
    x.z, y.z, z.z, 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ];
}

/** Column-major 4×4 multiply: returns `a · b`. */
export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += a[k * 4 + r] * b[c * 4 + k];
      }
      out[c * 4 + r] = s;
    }
  }
  return out;
}

export interface CameraMatrixInput {
  /** Camera position in world space (meters). */
  position: Coordinate3D;
  /** Heading in degrees, clockwise from north. */
  heading: number;
  /** Pitch in degrees below the horizon. */
  pitch: number;
  /** Vertical field of view in degrees. @default 60 */
  fov?: number;
  aspect: number;
  near?: number;
  far?: number;
}

/** World-space forward vector for a heading/pitch (x east, y north, z up). */
export function forwardVector(headingDeg: number, pitchDeg: number): Coordinate3D {
  const h = (headingDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  return {
    x: Math.sin(h) * Math.cos(p),
    y: Math.cos(h) * Math.cos(p),
    z: -Math.sin(p),
  };
}

/** Build the column-major view-projection matrix for a camera. */
export function buildViewProjection(input: CameraMatrixInput): Mat4 {
  const { position, heading, pitch, fov = 60, aspect, near = 1, far = 2000 } = input;
  const forward = forwardVector(heading, pitch);
  const center = {
    x: position.x + forward.x,
    y: position.y + forward.y,
    z: position.z + forward.z,
  };
  const proj = perspective((fov * Math.PI) / 180, aspect, near, far);
  const view = lookAt(position, center, { x: 0, y: 0, z: 1 });
  return multiply(proj, view);
}

/**
 * Project lng/lat to local world meters relative to a reference point using a
 * spherical web-mercator approximation. Accurate to well under a meter across a
 * 100 km region, which is sufficient for LOD bucketing.
 */
export function mercatorMeters(
  lng: number,
  lat: number,
  ref: { lng: number; lat: number } = { lng: 0, lat: 0 }
): { x: number; y: number } {
  const toRad = Math.PI / 180;
  const x = EARTH_RADIUS_M * (lng - ref.lng) * toRad * Math.cos(ref.lat * toRad);
  const y = EARTH_RADIUS_M * (lat - ref.lat) * toRad;
  return { x, y };
}
