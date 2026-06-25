import { describe, it, expect } from "vitest";
import {
  zoomEpsilon,
  douglasPeucker,
  perpendicularDistance,
  simplifyGeometry,
  simplifyEdges,
} from "@/utils/edgeSimplification";
import { SIMPLIFY_EPSILON, type NetworkEdge } from "@/types/network";

describe("zoomEpsilon", () => {
  it("is 5 m at zoom ≤ 14 and 20 m at zoom ≥ 16", () => {
    expect(zoomEpsilon(10)).toBe(SIMPLIFY_EPSILON.low);
    expect(zoomEpsilon(14)).toBe(5);
    expect(zoomEpsilon(16)).toBe(20);
    expect(zoomEpsilon(18)).toBe(20);
  });

  it("interpolates across the 14–16 band", () => {
    expect(zoomEpsilon(15)).toBe(12.5);
  });
});

describe("perpendicularDistance", () => {
  it("measures distance to the line through a,b", () => {
    const d = perpendicularDistance(
      { x: 0, y: 5 },
      { x: -10, y: 0 },
      { x: 10, y: 0 }
    );
    expect(d).toBeCloseTo(5, 10);
  });

  it("handles a degenerate segment", () => {
    const d = perpendicularDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 });
    expect(d).toBeCloseTo(5, 10);
  });
});

describe("douglasPeucker", () => {
  it("keeps endpoints and drops near-collinear points", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 0.001 },
      { x: 2, y: -0.001 },
      { x: 3, y: 0 },
    ];
    expect(douglasPeucker(pts, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 3, y: 0 },
    ]);
  });

  it("retains a point that deviates beyond epsilon", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 1, y: 10 },
      { x: 2, y: 0 },
    ];
    const out = douglasPeucker(pts, 1);
    expect(out).toHaveLength(3);
  });

  it("returns short polylines unchanged", () => {
    const pts = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
    expect(douglasPeucker(pts, 5)).toEqual(pts);
  });
});

describe("simplifyGeometry / simplifyEdges", () => {
  it("collapses a nearly-straight lng/lat run to its endpoints", () => {
    const ref: [number, number] = [0, 0];
    // ~0.0000001° ≈ 1 cm wiggle, well under the 5 m epsilon.
    const geom: [number, number][] = [
      [0, 0],
      [0.001, 0.0000001],
      [0.002, 0],
    ];
    expect(simplifyGeometry(geom, 5, ref)).toHaveLength(2);
  });

  it("simplifies every edge and preserves metadata", () => {
    const edges: NetworkEdge[] = [
      {
        id: "e1",
        geometry: [
          [0, 0],
          [0.001, 0.0000001],
          [0.002, 0],
        ],
        flowDirection: "forward",
        loadStatus: "nominal",
      },
    ];
    const out = simplifyEdges(edges, 12);
    expect(out[0].id).toBe("e1");
    expect(out[0].flowDirection).toBe("forward");
    expect(out[0].geometry.length).toBeLessThanOrEqual(3);
  });

  it("handles an empty edge list", () => {
    expect(simplifyEdges([], 14)).toEqual([]);
  });
});
