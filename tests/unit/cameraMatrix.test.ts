import { describe, it, expect } from "vitest";
import {
  buildViewProjection,
  forwardVector,
  mercatorMeters,
  perspective,
  multiply,
} from "@/utils/cameraMatrix";
import { extractFrustumPlanes, pointInFrustum } from "@/utils/frustum";

describe("perspective / multiply", () => {
  it("produces a 16-element column-major matrix", () => {
    const m = perspective(Math.PI / 3, 1, 1, 1000);
    expect(m).toHaveLength(16);
    expect(m[11]).toBe(-1);
  });

  it("multiply by identity is a no-op", () => {
    const id = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const m = perspective(Math.PI / 3, 1.5, 1, 100);
    expect(multiply(m, id)).toEqual(m);
  });
});

describe("forwardVector", () => {
  it("points north for heading 0, pitch 0", () => {
    const f = forwardVector(0, 0);
    expect(f.x).toBeCloseTo(0, 10);
    expect(f.y).toBeCloseTo(1, 10);
    expect(f.z).toBeCloseTo(0, 10);
  });

  it("points east for heading 90", () => {
    const f = forwardVector(90, 0);
    expect(f.x).toBeCloseTo(1, 10);
    expect(f.y).toBeCloseTo(0, 10);
  });

  it("tilts downward as pitch increases", () => {
    expect(forwardVector(0, 45).z).toBeLessThan(0);
  });
});

describe("buildViewProjection + frustum round-trip", () => {
  const vp = buildViewProjection({
    position: { x: 0, y: 0, z: 0 },
    heading: 0, // looking +y (north)
    pitch: 0,
    aspect: 1,
    fov: 60,
    near: 1,
    far: 1000,
  });
  const planes = extractFrustumPlanes(vp);

  it("sees a point straight ahead", () => {
    expect(pointInFrustum(planes, { x: 0, y: 10, z: 0 })).toBe(true);
  });

  it("does not see a point behind the camera", () => {
    expect(pointInFrustum(planes, { x: 0, y: -10, z: 0 })).toBe(false);
  });

  it("does not see a point beyond the far plane", () => {
    expect(pointInFrustum(planes, { x: 0, y: 2000, z: 0 })).toBe(false);
  });

  it("does not see a point far off-axis (outside the fov)", () => {
    expect(pointInFrustum(planes, { x: 500, y: 10, z: 0 })).toBe(false);
  });
});

describe("mercatorMeters", () => {
  it("maps the reference point to the origin", () => {
    const p = mercatorMeters(12.5, 41.9, { lng: 12.5, lat: 41.9 });
    expect(p.x).toBeCloseTo(0, 6);
    expect(p.y).toBeCloseTo(0, 6);
  });

  it("is monotonic in lng and lat", () => {
    const ref = { lng: 0, lat: 0 };
    expect(mercatorMeters(0.001, 0, ref).x).toBeGreaterThan(0);
    expect(mercatorMeters(0, 0.001, ref).y).toBeGreaterThan(0);
  });

  it("east/north offsets are ~111 m per 0.001° near the equator", () => {
    const { x } = mercatorMeters(0.001, 0, { lng: 0, lat: 0 });
    expect(x).toBeGreaterThan(100);
    expect(x).toBeLessThan(120);
  });
});
