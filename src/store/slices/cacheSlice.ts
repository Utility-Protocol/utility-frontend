"use client";

import { useSyncExternalStore } from "react";
import {
  cacheGroupOf,
  type CacheEntry,
  type ResourceStatus,
} from "@/types/suspense";

/**
 * Resource cache for the Suspense layer: per-key entries with a fetched-at
 * timestamp and TTL, supporting stale-while-revalidate reads and group
 * invalidation (a Retry button invalidates a whole domain group).
 *
 * Custom singleton store, matching the codebase pattern.
 */

export type CacheState = Record<string, CacheEntry>;

export type CacheAction =
  | { type: "CACHE_PENDING"; payload: { key: string; ttlMs: number } }
  | {
      type: "CACHE_UPDATED";
      payload: { key: string; data: unknown; fetchedAt: number; ttlMs: number };
    }
  | { type: "CACHE_REJECTED"; payload: { key: string; error: string; fetchedAt: number } }
  | { type: "CACHE_INVALIDATE"; payload: { group: string } }
  | { type: "CACHE_INVALIDATE_KEY"; payload: { key: string } }
  | { type: "RESET" };

/** A resolved entry is fresh while within its TTL (and not invalidated). */
export function isFresh(entry: CacheEntry | undefined, now: number): boolean {
  return (
    !!entry &&
    entry.status === "resolved" &&
    entry.fetchedAt > 0 &&
    now - entry.fetchedAt <= entry.ttlMs
  );
}

/** A resolved entry that has data but is past its TTL → serve + revalidate. */
export function isStale(entry: CacheEntry | undefined, now: number): boolean {
  return (
    !!entry &&
    entry.status === "resolved" &&
    entry.data !== undefined &&
    (entry.fetchedAt === 0 || now - entry.fetchedAt > entry.ttlMs)
  );
}

type Listener = (state: CacheState) => void;

class CacheStore {
  private state: CacheState = {};
  private listeners = new Set<Listener>();

  getState = (): Readonly<CacheState> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getEntry(key: string): CacheEntry | undefined {
    return this.state[key];
  }

  dispatch(action: CacheAction): void {
    const next = this.reducer(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.notify();
    }
  }

  // --- convenience mutators (used by the resource factory) ------------------

  setPending(key: string, ttlMs: number): void {
    this.dispatch({ type: "CACHE_PENDING", payload: { key, ttlMs } });
  }
  setResolved(key: string, data: unknown, ttlMs: number, now: number): void {
    this.dispatch({ type: "CACHE_UPDATED", payload: { key, data, fetchedAt: now, ttlMs } });
  }
  setRejected(key: string, error: string, now: number): void {
    this.dispatch({ type: "CACHE_REJECTED", payload: { key, error, fetchedAt: now } });
  }
  invalidateGroup(group: string): void {
    this.dispatch({ type: "CACHE_INVALIDATE", payload: { group } });
  }
  invalidateKey(key: string): void {
    this.dispatch({ type: "CACHE_INVALIDATE_KEY", payload: { key } });
  }

  private reducer(state: CacheState, action: CacheAction): CacheState {
    switch (action.type) {
      case "CACHE_PENDING": {
        const prev = state[action.payload.key];
        // Keep any existing data so a re-fetch can still serve stale-while-revalidate.
        const status: ResourceStatus = "pending";
        return {
          ...state,
          [action.payload.key]: {
            data: prev?.data,
            status,
            fetchedAt: prev?.fetchedAt ?? 0,
            ttlMs: action.payload.ttlMs,
          },
        };
      }
      case "CACHE_UPDATED":
        return {
          ...state,
          [action.payload.key]: {
            data: action.payload.data,
            status: "resolved",
            fetchedAt: action.payload.fetchedAt,
            ttlMs: action.payload.ttlMs,
          },
        };
      case "CACHE_REJECTED": {
        const prev = state[action.payload.key];
        return {
          ...state,
          [action.payload.key]: {
            data: prev?.data,
            status: "rejected",
            fetchedAt: action.payload.fetchedAt,
            ttlMs: prev?.ttlMs ?? 0,
            error: action.payload.error,
          },
        };
      }
      case "CACHE_INVALIDATE": {
        const group = action.payload.group;
        let changed = false;
        const next: CacheState = { ...state };
        for (const [key, entry] of Object.entries(state)) {
          if (cacheGroupOf(key) === group && entry.fetchedAt !== 0) {
            next[key] = { ...entry, fetchedAt: 0 };
            changed = true;
          }
        }
        return changed ? next : state;
      }
      case "CACHE_INVALIDATE_KEY": {
        const entry = state[action.payload.key];
        if (!entry || entry.fetchedAt === 0) return state;
        return { ...state, [action.payload.key]: { ...entry, fetchedAt: 0 } };
      }
      case "RESET":
        return {};
      default:
        return state;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

/** Shared singleton resource cache. */
export const cacheStore = new CacheStore();

export function useCacheState(): CacheState {
  return useSyncExternalStore(
    cacheStore.subscribe,
    cacheStore.getState,
    cacheStore.getState
  );
}
