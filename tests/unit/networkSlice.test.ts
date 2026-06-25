import { describe, it, expect, beforeEach } from "vitest";
import {
  networkStore,
  filterEdges,
  toggleNetworkVisibility,
  setStatusFilter,
  useNetworkUI,
} from "@/store/slices/networkSlice";
import type { LoadStatus, NetworkEdge } from "@/types/network";

function edge(id: string, loadStatus: LoadStatus): NetworkEdge {
  return {
    id,
    geometry: [
      [0, 0],
      [1, 1],
    ],
    flowDirection: "forward",
    loadStatus,
  };
}

const SAMPLE = [
  edge("a", "nominal"),
  edge("b", "overloaded"),
  edge("c", "idle"),
];

beforeEach(() => networkStore.dispatch({ type: "RESET" }));

describe("filterEdges", () => {
  it("returns all edges by default", () => {
    expect(filterEdges(SAMPLE, networkStore.getState())).toHaveLength(3);
  });

  it("returns nothing when hidden", () => {
    toggleNetworkVisibility();
    expect(filterEdges(SAMPLE, networkStore.getState())).toHaveLength(0);
  });

  it("filters by load status", () => {
    setStatusFilter(["overloaded"]);
    const out = filterEdges(SAMPLE, networkStore.getState());
    expect(out.map((e) => e.id)).toEqual(["b"]);
  });
});

describe("networkStore actions", () => {
  it("toggleNetworkVisibility flips visibility", () => {
    expect(networkStore.getState().visible).toBe(true);
    toggleNetworkVisibility();
    expect(networkStore.getState().visible).toBe(false);
    toggleNetworkVisibility();
    expect(networkStore.getState().visible).toBe(true);
  });

  it("setStatusFilter replaces the filter", () => {
    setStatusFilter(["nominal", "idle"]);
    expect(networkStore.getState().statusFilter).toEqual(["nominal", "idle"]);
  });

  it("notifies subscribers on change", () => {
    const seen: boolean[] = [];
    const unsub = networkStore.subscribe((s) => seen.push(s.visible));
    toggleNetworkVisibility();
    unsub();
    toggleNetworkVisibility();
    expect(seen).toEqual([false]);
  });

  it("exposes a React binding", () => {
    expect(typeof useNetworkUI).toBe("function");
  });
});
