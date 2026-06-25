import { describe, it, expect } from "vitest";
import {
  subdivide,
  edgeCompatibility,
  bundleEdges,
} from "@/utils/edgeBundling";
import { FDEB, type NetworkEdge } from "@/types/network";

function edge(
  id: string,
  from: [number, number],
  to: [number, number]
): NetworkEdge {
  return {
    id,
    geometry: [from, to],
    flowDirection: "forward",
    loadStatus: "nominal",
  };
}

describe("subdivide", () => {
  it("produces n evenly-spaced points including endpoints", () => {
    const pts = subdivide({ x: 0, y: 0 }, { x: 10, y: 0 }, 5);
    expect(pts).toHaveLength(5);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[4]).toEqual({ x: 10, y: 0 });
    expect(pts[2].x).toBeCloseTo(5, 10);
  });
});

describe("edgeCompatibility", () => {
  it("scores parallel segments as fully angle-compatible", () => {
    const c = edgeCompatibility(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 5 },
      { x: 10, y: 5 }
    );
    expect(c.angle).toBeCloseTo(1, 10);
  });

  it("scores perpendicular segments as angle-incompatible", () => {
    const c = edgeCompatibility(
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 0 },
      { x: 0, y: 10 }
    );
    expect(c.angle).toBeCloseTo(0, 10);
  });
});

describe("bundleEdges", () => {
  it("returns control-point polylines with pinned endpoints", () => {
    const e = edge("e1", [0, 0], [0.01, 0]);
    const [bundled] = bundleEdges([e]);
    expect(bundled.points).toHaveLength(FDEB.subdivisions);
    expect(bundled.points[0][0]).toBeCloseTo(0, 6);
    expect(bundled.points[0][1]).toBeCloseTo(0, 6);
    expect(bundled.points[FDEB.subdivisions - 1][0]).toBeCloseTo(0.01, 6);
  });

  it("keeps an isolated edge straight (no compatible partners)", () => {
    const [bundled] = bundleEdges([edge("e1", [0, 0], [0.01, 0])]);
    // Every control point stays on the y=0 line.
    for (const p of bundled.points) expect(p[1]).toBeCloseTo(0, 6);
  });

  it("pulls two parallel neighbouring edges together", () => {
    const a = edge("a", [0, 0], [0.01, 0]);
    const b = edge("b", [0, 0.001], [0.01, 0.001]);
    const result = bundleEdges([a, b]);
    const mid = Math.floor(FDEB.subdivisions / 2);
    const before = 0.001;
    const after = Math.abs(result[0].points[mid][1] - result[1].points[mid][1]);
    expect(after).toBeLessThan(before);
  });

  it("preserves edge metadata and ids", () => {
    const result = bundleEdges([edge("x", [0, 0], [0.01, 0.01])]);
    expect(result[0].id).toBe("x");
    expect(result[0].flowDirection).toBe("forward");
    expect(result[0].loadStatus).toBe("nominal");
  });

  it("handles an empty list", () => {
    expect(bundleEdges([])).toEqual([]);
  });

  it("respects the iteration cap (terminates)", () => {
    // A larger compatible set should still return promptly.
    const edges = Array.from({ length: 20 }, (_, i) =>
      edge(`e${i}`, [0, i * 0.0001], [0.01, i * 0.0001])
    );
    const result = bundleEdges(edges, { maxIterations: FDEB.maxIterations });
    expect(result).toHaveLength(20);
  });
});
