/**
 * Types and invariants for the Suspense boundary architecture.
 *
 * Four primary data domains (blockchain, telemetry, metadata, spatial) each get
 * a named Suspense boundary with a stale-while-revalidate resource cache, and
 * two composite boundaries (dashboard, map) coordinate a fallback cascade: when
 * a parent boundary errors, its children render an error state instead of their
 * own loaders.
 */

export type DomainKey = "blockchain" | "telemetry" | "metadata" | "spatial";

export const DOMAINS: DomainKey[] = [
  "blockchain",
  "telemetry",
  "metadata",
  "spatial",
];

/** Suspense fallback timeout per domain (ms). */
export const SUSPENSE_TIMEOUT_MS: Record<DomainKey, number> = {
  blockchain: 10_000, // Soroban RPC can be slow
  telemetry: 3_000, // WebSocket should be fast
  metadata: 5_000,
  spatial: 8_000,
};

/** Cache TTL per domain (ms) for the stale-while-revalidate window. */
export const CACHE_TTL_MS: Record<DomainKey, number> = {
  blockchain: 30_000,
  telemetry: 5_000,
  metadata: 120_000,
  spatial: 300_000,
};

/** Promise lifecycle of a Suspense resource. */
export type ResourceStatus = "pending" | "resolved" | "rejected";

/** A cached resource entry. */
export interface CacheEntry<T = unknown> {
  data?: T;
  status: ResourceStatus;
  /** When the data was fetched (unix ms); 0 means invalidated. */
  fetchedAt: number;
  ttlMs: number;
  error?: string;
}

/** A Suspense-compatible resource handle. */
export interface SuspenseResource<T> {
  /** Read for render: returns data, or throws a promise/error for Suspense. */
  read(): T;
  /** Kick off a fetch without suspending. */
  prefetch(): void;
  /** Force the next read to re-fetch. */
  invalidate(): void;
  /** Non-throwing peek at the cached data, if any. */
  peek(): T | undefined;
}

/**
 * Cache keys are `"<domain>:<id>"`. The domain prefix is the invalidation group
 * a Retry button targets.
 */
export function cacheGroupOf(cacheKey: string): string {
  const idx = cacheKey.indexOf(":");
  return idx === -1 ? cacheKey : cacheKey.slice(0, idx);
}

export function domainCacheKey(domain: DomainKey, id: string): string {
  return `${domain}:${id}`;
}
