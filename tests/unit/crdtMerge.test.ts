import { describe, it, expect } from "vitest";
import {
  mergeRegister,
  emptyOrSet,
  orSetAdd,
  orSetRemove,
  orSetRemoveTags,
  orSetMerge,
  orSetValues,
  observedTags,
  mergeEvents,
} from "@/utils/crdtMerge";
import type {
  ChainId,
  CrdtEvent,
  LWWRegister,
  LamportTimestamp,
  ResourceState,
  VectorClock,
} from "@/types/crdt";

const ts = (chainId: ChainId, counter: number): LamportTimestamp => ({ chainId, counter });
const reg = <T>(value: T, t: LamportTimestamp): LWWRegister<T> => ({
  kind: "lww",
  value,
  timestamp: t,
});

describe("mergeRegister (LWW)", () => {
  it("keeps the value with the greater timestamp", () => {
    expect(mergeRegister(reg("a", ts("testnet", 1)), reg("b", ts("testnet", 2))).value).toBe("b");
  });

  it("breaks concurrent ties by chain priority", () => {
    const winner = mergeRegister(reg("t", ts("testnet", 5)), reg("m", ts("mainnet", 5)));
    expect(winner.value).toBe("m");
  });

  it("is commutative", () => {
    const a = reg("a", ts("testnet", 5));
    const b = reg("b", ts("mainnet", 5));
    expect(mergeRegister(a, b)).toEqual(mergeRegister(b, a));
  });
});

describe("OR-set", () => {
  it("adds and materialises elements", () => {
    let s = emptyOrSet<string>();
    s = orSetAdd(s, "deviceA", "t1");
    s = orSetAdd(s, "deviceB", "t2");
    expect(orSetValues(s).sort()).toEqual(["deviceA", "deviceB"]);
  });

  it("removes by tombstoning observed tags", () => {
    let s = orSetAdd(emptyOrSet<string>(), "x", "t1");
    s = orSetRemove(s, "x");
    expect(orSetValues(s)).toEqual([]);
  });

  it("supports add → remove → re-add with a fresh tag", () => {
    let s = orSetAdd(emptyOrSet<string>(), "x", "t1");
    s = orSetRemove(s, "x"); // tombstones t1
    expect(orSetValues(s)).toEqual([]);
    s = orSetAdd(s, "x", "t2"); // fresh tag survives
    expect(orSetValues(s)).toEqual(["x"]);
  });

  it("concurrent add wins over a remove that didn't observe its tag", () => {
    // Replica A adds with tag tA; replica B removes (observing only tB).
    const base = orSetAdd(emptyOrSet<string>(), "x", "tB");
    const a = orSetAdd(base, "x", "tA"); // A adds a fresh tag
    const observed = observedTags(base, "x"); // B only saw [tB]
    const b = orSetRemoveTags(base, observed); // B removes tB
    const merged = orSetMerge(a, b);
    // tA was never tombstoned → element survives (add-wins).
    expect(orSetValues(merged)).toEqual(["x"]);
  });

  it("merge is commutative", () => {
    const a = orSetAdd(orSetAdd(emptyOrSet<string>(), "x", "t1"), "y", "t2");
    const b = orSetRemoveTags(orSetAdd(emptyOrSet<string>(), "z", "t3"), ["t1"]);
    expect(orSetValues(orSetMerge(a, b)).sort()).toEqual(
      orSetValues(orSetMerge(b, a)).sort()
    );
  });
});

describe("mergeEvents convergence", () => {
  const events: CrdtEvent[] = [
    { type: "register-set", resourceId: "meter:1", value: 10, timestamp: ts("testnet", 1) },
    { type: "register-set", resourceId: "meter:1", value: 20, timestamp: ts("mainnet", 3) },
    { type: "register-set", resourceId: "meter:1", value: 15, timestamp: ts("futurenet", 2) },
    { type: "or-set-add", resourceId: "devices", element: "d1", tag: "g1", timestamp: ts("testnet", 1) },
    { type: "or-set-add", resourceId: "devices", element: "d2", tag: "g2", timestamp: ts("mainnet", 2) },
    { type: "or-set-remove", resourceId: "devices", element: "d1", tags: ["g1"], timestamp: ts("mainnet", 4) },
  ];

  function materialise(state: ResourceState | undefined): unknown {
    if (!state) return undefined;
    return state.kind === "lww" ? state.value : orSetValues(state).sort();
  }

  function runOrder(order: CrdtEvent[]): Record<string, unknown> {
    const { diffs } = mergeEvents({}, {}, order);
    const out: Record<string, unknown> = {};
    for (const d of diffs) out[d.resourceId] = materialise(d.state);
    return out;
  }

  it("converges to the same state under arbitrary interleavings", () => {
    const original = runOrder(events);
    // The LWW winner is the highest timestamp (mainnet,3) → 20.
    expect(original["meter:1"]).toBe(20);
    // d1 removed (g1 tombstoned), d2 present.
    expect(original["devices"]).toEqual(["d2"]);

    // Several permutations must yield identical materialised state.
    const reversed = runOrder([...events].reverse());
    const rotated = runOrder([...events.slice(3), ...events.slice(0, 3)]);
    expect(reversed).toEqual(original);
    expect(rotated).toEqual(original);
  });

  it("reports vector clocks and chain-seen counters", () => {
    const { diffs, chainSeen } = mergeEvents({}, {}, events);
    const meter = diffs.find((d) => d.resourceId === "meter:1")!;
    const expectedClock: VectorClock = { testnet: 1, mainnet: 3, futurenet: 2 };
    expect(meter.vectorClock).toEqual(expectedClock);
    expect(chainSeen).toEqual({ testnet: 1, mainnet: 4, futurenet: 2 });
  });

  it("folds incrementally into prior state like the worker does", () => {
    const first = mergeEvents({}, {}, events.slice(0, 3));
    const states: Record<string, ResourceState> = {};
    const clocks: Record<string, VectorClock> = {};
    for (const d of first.diffs) {
      states[d.resourceId] = d.state;
      clocks[d.resourceId] = d.vectorClock;
    }
    const second = mergeEvents(states, clocks, events.slice(3));
    const all: Record<string, unknown> = {};
    for (const d of [...first.diffs, ...second.diffs]) {
      all[d.resourceId] = materialise(d.state);
    }
    expect(all["meter:1"]).toBe(20);
    expect(all["devices"]).toEqual(["d2"]);
  });
});
