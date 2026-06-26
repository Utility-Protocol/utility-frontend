import { describe, it, expect, beforeEach } from "vitest";
import {
  tileCacheStore,
  selectHitRatio,
} from "@/store/slices/tileCacheSlice";

beforeEach(() => tileCacheStore.dispatch({ type: "RESET" }));

describe("tileCacheStore", () => {
  it("counts hits and misses and derives the hit ratio", () => {
    tileCacheStore.dispatch({ type: "CACHE_HIT" });
    tileCacheStore.dispatch({ type: "CACHE_HIT" });
    tileCacheStore.dispatch({ type: "CACHE_MISS" });
    const s = tileCacheStore.getState();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(selectHitRatio(s)).toBeCloseTo(2 / 3, 10);
  });

  it("hit ratio is 0 before any lookup", () => {
    expect(selectHitRatio(tileCacheStore.getState())).toBe(0);
  });

  it("accumulates stored tiles and byte usage", () => {
    tileCacheStore.dispatch({ type: "TILE_STORED", payload: { bytes: 42_000 } });
    tileCacheStore.dispatch({ type: "TILE_STORED", payload: { bytes: 18_000 } });
    const s = tileCacheStore.getState();
    expect(s.count).toBe(2);
    expect(s.bytes).toBe(60_000);
  });

  it("subtracts evicted tiles and bytes (clamped at 0)", () => {
    tileCacheStore.dispatch({ type: "TILE_STORED", payload: { bytes: 50_000 } });
    tileCacheStore.dispatch({
      type: "TILES_EVICTED",
      payload: { count: 1, freedBytes: 50_000 },
    });
    const s = tileCacheStore.getState();
    expect(s.evictions).toBe(1);
    expect(s.count).toBe(0);
    expect(s.bytes).toBe(0);
  });

  it("tracks pending downloads", () => {
    tileCacheStore.dispatch({ type: "PENDING_SET", payload: { pending: 45 } });
    expect(tileCacheStore.getState().pending).toBe(45);
    tileCacheStore.dispatch({ type: "PENDING_SET", payload: { pending: -5 } });
    expect(tileCacheStore.getState().pending).toBe(0);
  });
});
