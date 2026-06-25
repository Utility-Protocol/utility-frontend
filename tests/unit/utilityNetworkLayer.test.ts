import { describe, it, expect } from "vitest";
import { edgeColor, buildVertexData } from "@/components/map/UtilityNetworkLayer";
import { FLOW_COLOR, LOAD_ALPHA, type LngLat } from "@/types/network";

describe("edgeColor", () => {
  it("maps flow direction to hue and load status to alpha", () => {
    expect(edgeColor({ flowDirection: "forward", loadStatus: "nominal" })).toEqual([
      ...FLOW_COLOR.forward,
      LOAD_ALPHA.nominal,
    ]);
    expect(
      edgeColor({ flowDirection: "reverse", loadStatus: "overloaded" })
    ).toEqual([...FLOW_COLOR.reverse, LOAD_ALPHA.overloaded]);
    expect(edgeColor({ flowDirection: "bidirectional", loadStatus: "idle" })).toEqual([
      ...FLOW_COLOR.bidirectional,
      LOAD_ALPHA.idle,
    ]);
  });
});

describe("buildVertexData", () => {
  const points: LngLat[] = [
    [0, 0],
    [0, 0],
  ];

  it("interleaves [x, y, r, g, b, a] per vertex", () => {
    const data = buildVertexData([
      { points, flowDirection: "forward", loadStatus: "nominal" },
    ]);
    expect(data.vertexCount).toBe(2);
    expect(data.interleaved).toHaveLength(12);
    // Position is normalized mercator: lng/lat [0,0] → [0.5, 0.5].
    expect(data.interleaved[0]).toBeCloseTo(0.5, 6);
    expect(data.interleaved[1]).toBeCloseTo(0.5, 6);
    // Color is the forward/nominal RGBA (stored as float32, so compare loosely).
    const expectedColor = [...FLOW_COLOR.forward, LOAD_ALPHA.nominal];
    for (let i = 0; i < 4; i++) {
      expect(data.interleaved[2 + i]).toBeCloseTo(expectedColor[i], 5);
    }
  });

  it("emits one line-segment index pair per polyline segment", () => {
    const data = buildVertexData([
      {
        points: [
          [0, 0],
          [1, 0],
          [2, 0],
        ],
        flowDirection: "forward",
        loadStatus: "nominal",
      },
    ]);
    // 3 vertices → 2 segments → 4 indices.
    expect(Array.from(data.indices)).toEqual([0, 1, 1, 2]);
  });

  it("does not connect separate edges in the index buffer", () => {
    const data = buildVertexData([
      { points: [[0, 0], [1, 0]], flowDirection: "forward", loadStatus: "nominal" },
      { points: [[2, 0], [3, 0]], flowDirection: "reverse", loadStatus: "idle" },
    ]);
    // Two separate segments: [0,1] and [2,3]; never [1,2].
    expect(Array.from(data.indices)).toEqual([0, 1, 2, 3]);
  });

  it("handles an empty edge set", () => {
    const data = buildVertexData([]);
    expect(data.vertexCount).toBe(0);
    expect(data.indices).toHaveLength(0);
  });
});
