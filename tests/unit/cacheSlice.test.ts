import { describe, it, expect, beforeEach } from "vitest";
import { cacheStore, isFresh, isStale } from "@/store/slices/cacheSlice";
import type { CacheEntry } from "@/types/suspense";

beforeEach(() => cacheStore.dispatch({ type: "RESET" }));

const entry = (over: Partial<CacheEntry> = {}): CacheEntry => ({
  data: { v: 1 },
  status: "resolved",
  fetchedAt: 1000,
  ttlMs: 5000,
  ...over,
});

describe("isFresh / isStale", () => {
  it("is fresh within the TTL", () => {
    expect(isFresh(entry({ fetchedAt: 1000, ttlMs: 5000 }), 2000)).toBe(true);
    expect(isStale(entry({ fetchedAt: 1000, ttlMs: 5000 }), 2000)).toBe(false);
  });

  it("is stale past the TTL", () => {
    expect(isFresh(entry({ fetchedAt: 1000, ttlMs: 5000 }), 7000)).toBe(false);
    expect(isStale(entry({ fetchedAt: 1000, ttlMs: 5000 }), 7000)).toBe(true);
  });

  it("treats fetchedAt 0 (invalidated) as stale", () => {
    expect(isFresh(entry({ fetchedAt: 0 }), 1000)).toBe(false);
    expect(isStale(entry({ fetchedAt: 0 }), 1000)).toBe(true);
  });

  it("a pending entry without data is neither fresh nor stale", () => {
    const e = entry({ status: "pending", data: undefined });
    expect(isFresh(e, 2000)).toBe(false);
    expect(isStale(e, 2000)).toBe(false);
  });
});

describe("cacheStore mutations", () => {
  it("stores resolved data with timestamp + ttl", () => {
    cacheStore.setResolved("blockchain:x", { ledger: 9 }, 30_000, 5000);
    const e = cacheStore.getEntry("blockchain:x")!;
    expect(e.status).toBe("resolved");
    expect(e.data).toEqual({ ledger: 9 });
    expect(e.fetchedAt).toBe(5000);
  });

  it("records rejection while preserving any stale data", () => {
    cacheStore.setResolved("metadata:y", { tariffs: 2 }, 1000, 1000);
    cacheStore.setRejected("metadata:y", "boom", 6000);
    const e = cacheStore.getEntry("metadata:y")!;
    expect(e.status).toBe("rejected");
    expect(e.error).toBe("boom");
    expect(e.data).toEqual({ tariffs: 2 }); // kept for SWR
  });

  it("invalidates a whole group (sets fetchedAt to 0)", () => {
    cacheStore.setResolved("blockchain:a", 1, 1000, 1000);
    cacheStore.setResolved("blockchain:b", 2, 1000, 1000);
    cacheStore.setResolved("telemetry:c", 3, 1000, 1000);
    cacheStore.invalidateGroup("blockchain");
    expect(cacheStore.getEntry("blockchain:a")!.fetchedAt).toBe(0);
    expect(cacheStore.getEntry("blockchain:b")!.fetchedAt).toBe(0);
    expect(cacheStore.getEntry("telemetry:c")!.fetchedAt).toBe(1000); // untouched
  });

  it("invalidates a single key", () => {
    cacheStore.setResolved("spatial:tile", 1, 1000, 1000);
    cacheStore.invalidateKey("spatial:tile");
    expect(cacheStore.getEntry("spatial:tile")!.fetchedAt).toBe(0);
  });
});
