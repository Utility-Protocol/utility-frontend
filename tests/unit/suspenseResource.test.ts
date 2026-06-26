import { describe, it, expect, vi, beforeEach } from "vitest";
import { createResource, _clearInflight } from "@/utils/suspenseResource";
import type { CacheEntry } from "@/types/suspense";

/** In-memory fake of the cache store the resource factory talks to. */
function fakeStore() {
  const m = new Map<string, CacheEntry>();
  return {
    map: m,
    getEntry: (k: string) => m.get(k),
    setPending: (k: string, ttlMs: number) => {
      const prev = m.get(k);
      m.set(k, { data: prev?.data, status: "pending", fetchedAt: prev?.fetchedAt ?? 0, ttlMs });
    },
    setResolved: (k: string, data: unknown, ttlMs: number, now: number) =>
      m.set(k, { data, status: "resolved", fetchedAt: now, ttlMs }),
    setRejected: (k: string, error: string, now: number) => {
      const prev = m.get(k);
      m.set(k, { data: prev?.data, status: "rejected", fetchedAt: now, ttlMs: prev?.ttlMs ?? 0, error });
    },
    invalidateKey: (k: string) => {
      const e = m.get(k);
      if (e) m.set(k, { ...e, fetchedAt: 0 });
    },
  };
}

let keyCounter = 0;
const nextKey = () => `blockchain:r${keyCounter++}`;

beforeEach(() => _clearInflight());

describe("createResource.read", () => {
  it("throws the fetch promise while pending, then returns data once resolved", async () => {
    const store = fakeStore();
    const key = nextKey();
    const fetchFn = vi.fn().mockResolvedValue({ ledger: 7 });
    const resource = createResource(fetchFn, { cacheKey: key, ttlMs: 5000, now: () => 1000, store });

    let thrown: unknown;
    try {
      resource.read();
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Promise);
    await thrown;

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(resource.read()).toEqual({ ledger: 7 });
  });

  it("returns cached data without re-fetching while fresh", () => {
    const store = fakeStore();
    const key = nextKey();
    store.setResolved(key, { v: 1 }, 5000, 1000);
    const fetchFn = vi.fn().mockResolvedValue({ v: 2 });
    const resource = createResource(fetchFn, { cacheKey: key, ttlMs: 5000, now: () => 2000, store });

    expect(resource.read()).toEqual({ v: 1 });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("serves stale data immediately and revalidates in the background (SWR)", async () => {
    const store = fakeStore();
    const key = nextKey();
    store.setResolved(key, { v: 1 }, 5000, 1000); // fetched at t=1000
    const fetchFn = vi.fn().mockResolvedValue({ v: 2 });
    const resource = createResource(fetchFn, { cacheKey: key, ttlMs: 5000, now: () => 10_000, store });

    // Past TTL → returns cached value, does NOT throw, kicks a background fetch.
    expect(resource.read()).toEqual({ v: 1 });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    await Promise.resolve();
    await Promise.resolve();
    expect(store.getEntry(key)!.data).toEqual({ v: 2 }); // revalidated
  });

  it("throws the error for a rejected resource", () => {
    const store = fakeStore();
    const key = nextKey();
    store.setRejected(key, "rpc down", 1000);
    const resource = createResource(vi.fn(), { cacheKey: key, ttlMs: 5000, now: () => 2000, store });
    expect(() => resource.read()).toThrow("rpc down");
  });

  it("invalidate forces the next read to re-fetch", async () => {
    const store = fakeStore();
    const key = nextKey();
    store.setResolved(key, { v: 1 }, 5000, 1000);
    const fetchFn = vi.fn().mockResolvedValue({ v: 2 });
    const resource = createResource(fetchFn, { cacheKey: key, ttlMs: 5000, now: () => 1500, store });

    expect(resource.read()).toEqual({ v: 1 }); // fresh, no fetch
    expect(fetchFn).not.toHaveBeenCalled();

    resource.invalidate();
    expect(resource.read()).toEqual({ v: 1 }); // stale → serves cached + bg fetch
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(store.getEntry(key)!.data).toEqual({ v: 2 });
  });

  it("de-duplicates concurrent fetches for the same key", () => {
    const store = fakeStore();
    const key = nextKey();
    const fetchFn = vi.fn().mockResolvedValue({ v: 1 });
    const resource = createResource(fetchFn, { cacheKey: key, ttlMs: 5000, now: () => 1000, store });
    try { resource.read(); } catch { /* suspends */ }
    try { resource.read(); } catch { /* suspends again, same in-flight */ }
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("createResource.prefetch / peek", () => {
  it("prefetch warms the cache without throwing", async () => {
    const store = fakeStore();
    const key = nextKey();
    const fetchFn = vi.fn().mockResolvedValue({ v: 9 });
    const resource = createResource(fetchFn, { cacheKey: key, ttlMs: 5000, now: () => 1000, store });
    resource.prefetch();
    expect(fetchFn).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(resource.peek()).toEqual({ v: 9 });
  });
});
