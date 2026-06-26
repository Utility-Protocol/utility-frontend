"use client";

import { cacheStore, isFresh } from "@/store/slices/cacheSlice";
import { type SuspenseResource } from "@/types/suspense";

/**
 * Factory for Suspense-compatible resources.
 *
 * `read()` implements the throw-promise pattern with stale-while-revalidate:
 *   - fresh cache → return data;
 *   - stale cache → return data *and* revalidate in the background (no suspend);
 *   - no usable data → throw the in-flight fetch promise (suspend);
 *   - rejected → throw the error (for an ErrorBoundary), until invalidated.
 *
 * In-flight fetches are de-duplicated per cache key.
 */

interface CacheStoreLike {
  getEntry(key: string): import("@/types/suspense").CacheEntry | undefined;
  setPending(key: string, ttlMs: number): void;
  setResolved(key: string, data: unknown, ttlMs: number, now: number): void;
  setRejected(key: string, error: string, now: number): void;
  invalidateKey(key: string): void;
}

export interface CreateResourceOptions {
  cacheKey: string;
  ttlMs: number;
  now?: () => number;
  store?: CacheStoreLike;
}

/** In-flight fetch promises, keyed by cache key (module-global de-dup). */
const inflight = new Map<string, Promise<unknown>>();

export function createResource<T>(
  fetchFn: () => Promise<T>,
  options: CreateResourceOptions
): SuspenseResource<T> {
  const { cacheKey, ttlMs } = options;
  const now = options.now ?? Date.now;
  const store = options.store ?? cacheStore;

  function runFetch(foreground: boolean): Promise<unknown> {
    const existing = inflight.get(cacheKey);
    if (existing) return existing;

    if (foreground) store.setPending(cacheKey, ttlMs);

    const promise = fetchFn()
      .then((data) => {
        store.setResolved(cacheKey, data, ttlMs, now());
      })
      .catch((err: unknown) => {
        store.setRejected(
          cacheKey,
          err instanceof Error ? err.message : String(err),
          now()
        );
      })
      .finally(() => {
        inflight.delete(cacheKey);
      });

    inflight.set(cacheKey, promise);
    return promise;
  }

  return {
    read(): T {
      const entry = store.getEntry(cacheKey);
      const t = now();

      if (entry?.status === "rejected" && entry.fetchedAt !== 0) {
        throw new Error(entry.error ?? `resource ${cacheKey} failed`);
      }

      if (entry && entry.data !== undefined && entry.status !== "rejected") {
        if (isFresh(entry, t)) return entry.data as T;
        // Stale: serve cached data and revalidate in the background.
        void runFetch(false);
        return entry.data as T;
      }

      // No usable data → suspend on the fetch promise.
      throw runFetch(true);
    },

    prefetch(): void {
      const entry = store.getEntry(cacheKey);
      if (isFresh(entry, now())) return;
      void runFetch(false);
    },

    invalidate(): void {
      store.invalidateKey(cacheKey);
    },

    peek(): T | undefined {
      return store.getEntry(cacheKey)?.data as T | undefined;
    },
  };
}

/** Test/teardown helper: drop any in-flight promise tracking. */
export function _clearInflight(): void {
  inflight.clear();
}
