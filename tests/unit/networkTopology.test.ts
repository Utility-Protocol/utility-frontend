import { describe, it, expect } from "vitest";
import { parseGeoJsonNetwork } from "@/hooks/useNetworkTopology";

describe("parseGeoJsonNetwork", () => {
  it("parses LineString features into edges with metadata", () => {
    const edges = parseGeoJsonNetwork({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 1]] },
          properties: { id: "pipe-1", flowDirection: "reverse", loadStatus: "overloaded" },
        },
      ],
    });
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      id: "pipe-1",
      flowDirection: "reverse",
      loadStatus: "overloaded",
    });
    expect(edges[0].geometry).toEqual([[0, 0], [1, 1]]);
  });

  it("defaults missing/invalid properties", () => {
    const [edge] = parseGeoJsonNetwork({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] },
          properties: { flowDirection: "sideways" as never },
        },
      ],
    });
    expect(edge.id).toBe("edge-0");
    expect(edge.flowDirection).toBe("bidirectional");
    expect(edge.loadStatus).toBe("nominal");
  });

  it("skips non-LineString and degenerate features", () => {
    const edges = parseGeoJsonNetwork({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          // @ts-expect-error — intentionally wrong geometry type
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: {},
        },
        {
          type: "Feature",
          geometry: { type: "LineString", coordinates: [[0, 0]] }, // too short
          properties: {},
        },
      ],
    });
    expect(edges).toHaveLength(0);
  });
});
