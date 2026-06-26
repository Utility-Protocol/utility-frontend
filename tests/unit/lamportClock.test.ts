import { describe, it, expect } from "vitest";
import {
  LamportClock,
  compareTimestamp,
  maxTimestamp,
  dominates,
} from "@/utils/lamportClock";
import type { LamportTimestamp } from "@/types/crdt";

const ts = (chainId: LamportTimestamp["chainId"], counter: number): LamportTimestamp => ({
  chainId,
  counter,
});

describe("compareTimestamp", () => {
  it("orders by counter first", () => {
    expect(compareTimestamp(ts("testnet", 1), ts("testnet", 2))).toBe(-1);
    expect(compareTimestamp(ts("testnet", 3), ts("testnet", 2))).toBe(1);
  });

  it("breaks ties by chain priority (mainnet > testnet > futurenet)", () => {
    expect(compareTimestamp(ts("mainnet", 5), ts("testnet", 5))).toBe(1);
    expect(compareTimestamp(ts("futurenet", 5), ts("testnet", 5))).toBe(-1);
  });

  it("is equal only for the same chain and counter", () => {
    expect(compareTimestamp(ts("mainnet", 5), ts("mainnet", 5))).toBe(0);
  });

  it("is a deterministic total order regardless of argument order", () => {
    const a = ts("testnet", 5);
    const b = ts("mainnet", 5);
    expect(compareTimestamp(a, b)).toBe(-compareTimestamp(b, a));
  });

  it("maxTimestamp and dominates agree with compare", () => {
    expect(maxTimestamp(ts("futurenet", 4), ts("mainnet", 4))).toEqual(
      ts("mainnet", 4)
    );
    expect(dominates(ts("mainnet", 4), ts("testnet", 4))).toBe(true);
    expect(dominates(ts("testnet", 4), ts("mainnet", 4))).toBe(false);
  });
});

describe("LamportClock", () => {
  it("ticks monotonically", () => {
    const clock = new LamportClock("testnet");
    expect(clock.tick()).toEqual(ts("testnet", 1));
    expect(clock.tick()).toEqual(ts("testnet", 2));
    expect(clock.value).toBe(2);
  });

  it("observes remote timestamps and advances past them", () => {
    const clock = new LamportClock("testnet", 3);
    clock.observe(ts("mainnet", 10));
    expect(clock.value).toBe(10);
    expect(clock.tick()).toEqual(ts("testnet", 11));
  });

  it("does not regress on a lower remote timestamp", () => {
    const clock = new LamportClock("testnet", 7);
    clock.observe(ts("mainnet", 2));
    expect(clock.value).toBe(7);
  });

  it("tickAfter implements receive-then-send", () => {
    const clock = new LamportClock("testnet", 4);
    expect(clock.tickAfter(ts("mainnet", 9))).toEqual(ts("testnet", 10));
  });
});
