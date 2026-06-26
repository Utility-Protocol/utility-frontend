import { describe, it, expect } from "vitest";
import { LRUList } from "@/utils/lruEviction";
import { TTL_MS, type TileMeta } from "@/types/tile";

function meta(
  key: string,
  over: Partial<TileMeta> = {}
): TileMeta {
  return {
    key,
    z: 14,
    size: 42_000,
    fetchedAt: 0,
    accessCount: 0,
    lastAccess: 0,
    ...over,
  };
}

describe("LRUList ordering", () => {
  it("keeps newest at the head", () => {
    const lru = new LRUList();
    lru.add(meta("a"));
    lru.add(meta("b"));
    lru.add(meta("c"));
    expect(lru.orderedKeys()).toEqual(["c", "b", "a"]);
  });

  it("touch promotes to MRU and bumps access stats", () => {
    const lru = new LRUList();
    lru.add(meta("a"));
    lru.add(meta("b"));
    const updated = lru.touch("a", 5000);
    expect(lru.orderedKeys()).toEqual(["a", "b"]);
    expect(updated?.accessCount).toBe(1);
    expect(updated?.lastAccess).toBe(5000);
  });

  it("tracks size and byte usage", () => {
    const lru = new LRUList();
    lru.add(meta("a", { size: 1000 }));
    lru.add(meta("b", { size: 2000 }));
    expect(lru.size).toBe(2);
    expect(lru.byteSize).toBe(3000);
    lru.remove("a");
    expect(lru.byteSize).toBe(2000);
  });

  it("replacing a key adjusts byte usage", () => {
    const lru = new LRUList();
    lru.add(meta("a", { size: 1000 }));
    lru.add(meta("a", { size: 4000 }));
    expect(lru.size).toBe(1);
    expect(lru.byteSize).toBe(4000);
  });
});

describe("LRUList eviction", () => {
  it("evicts the lowest access_count / age ratio first", () => {
    const now = 10_000;
    const lru = new LRUList();
    lru.add(meta("hot", { fetchedAt: 0, accessCount: 100 })); // 0.01
    lru.add(meta("cold", { fetchedAt: 0, accessCount: 1 })); // 0.0001
    lru.add(meta("recent", { fetchedAt: 9000, accessCount: 1 })); // 0.001
    const order = lru.evictionCandidates(3, now).map((c) => c.key);
    expect(order).toEqual(["cold", "recent", "hot"]);
  });

  it("evicts stale tiles before any fresh tile regardless of ratio", () => {
    const now = TTL_MS.highZoom + 100_000;
    const lru = new LRUList();
    lru.add(meta("fresh", { z: 14, fetchedAt: now - 1000, accessCount: 0 }));
    lru.add(
      meta("stale", { z: 16, fetchedAt: now - TTL_MS.highZoom - 1, accessCount: 999 })
    );
    expect(lru.evictionCandidates(1, now)[0].key).toBe("stale");
  });

  it("evict removes entries and returns the keys", () => {
    const now = 10_000;
    const lru = new LRUList();
    lru.add(meta("a", { accessCount: 1, fetchedAt: 0 }));
    lru.add(meta("b", { accessCount: 100, fetchedAt: 0 }));
    const removed = lru.evict(now, 1);
    expect(removed).toEqual(["a"]);
    expect(lru.has("a")).toBe(false);
    expect(lru.has("b")).toBe(true);
  });

  it("shouldEvict triggers at the threshold", () => {
    const lru = new LRUList();
    lru.add(meta("a"));
    lru.add(meta("b"));
    expect(lru.shouldEvict(3)).toBe(false);
    lru.add(meta("c"));
    expect(lru.shouldEvict(3)).toBe(true);
  });
});
