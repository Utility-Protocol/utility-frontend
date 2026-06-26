import { describe, it, expect, beforeEach } from "vitest";
import {
  crdtStore,
  findStaleChains,
  runStalenessWatch,
  selectResourceValue,
} from "@/store/slices/crdtSlice";
import { RECONCILE_TIMEOUT_MS, type ResourceDiff } from "@/types/crdt";

beforeEach(() => crdtStore.dispatch({ type: "RESET" }));

const registerDiff = (id: string, value: unknown): ResourceDiff => ({
  resourceId: id,
  state: { kind: "lww", value, timestamp: { chainId: "mainnet", counter: 1 } },
  vectorClock: { mainnet: 1 },
});

describe("findStaleChains", () => {
  it("flags chains silent past the timeout", () => {
    const lastSeen = { mainnet: 0, testnet: 1000 };
    expect(findStaleChains(lastSeen, RECONCILE_TIMEOUT_MS + 500, RECONCILE_TIMEOUT_MS)).toEqual([
      "mainnet",
    ]);
  });

  it("returns nothing when all chains are fresh", () => {
    expect(findStaleChains({ mainnet: 1000 }, 1500, RECONCILE_TIMEOUT_MS)).toEqual([]);
  });
});

describe("crdtStore", () => {
  it("applies diffs and records the chains seen", () => {
    crdtStore.dispatch({
      type: "APPLY_DIFFS",
      payload: {
        diffs: [registerDiff("meter:1", 42)],
        chainSeen: { mainnet: 1 },
        at: 5000,
      },
    });
    const state = crdtStore.getState();
    expect(selectResourceValue(state, "meter:1")).toBe(42);
    expect(state.lastSeen.mainnet).toBe(5000);
  });

  it("materialises an OR-set resource as an array", () => {
    crdtStore.dispatch({
      type: "APPLY_DIFFS",
      payload: {
        diffs: [
          {
            resourceId: "devices",
            state: {
              kind: "or-set",
              adds: { d1: ["t1"], d2: ["t2"] },
              tombstones: ["t2"],
              values: { d1: "d1", d2: "d2" },
            },
            vectorClock: { mainnet: 2 },
          },
        ],
        chainSeen: { mainnet: 2 },
        at: 1,
      },
    });
    expect(selectResourceValue(crdtStore.getState(), "devices")).toEqual(["d1"]);
  });

  it("flags stale chains for reconciliation, then clears on next sighting", () => {
    crdtStore.dispatch({ type: "CHAIN_SEEN", payload: { chainId: "testnet", at: 0 } });
    const flagged = runStalenessWatch(RECONCILE_TIMEOUT_MS + 1000, RECONCILE_TIMEOUT_MS);
    expect(flagged).toEqual(["testnet"]);
    expect(crdtStore.getState().reconciling).toEqual(["testnet"]);

    // A fresh sighting clears the reconcile flag.
    crdtStore.dispatch({ type: "CHAIN_SEEN", payload: { chainId: "testnet", at: 999999 } });
    expect(crdtStore.getState().reconciling).toEqual([]);
  });

  it("applying a diff clears reconcile for chains heard from", () => {
    crdtStore.dispatch({ type: "RECONCILE", payload: { chainId: "futurenet" } });
    expect(crdtStore.getState().reconciling).toContain("futurenet");
    crdtStore.dispatch({
      type: "APPLY_DIFFS",
      payload: { diffs: [], chainSeen: { futurenet: 5 }, at: 10 },
    });
    expect(crdtStore.getState().reconciling).toEqual([]);
  });
});
