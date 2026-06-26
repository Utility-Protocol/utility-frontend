"use client";

import { useSyncExternalStore } from "react";

/**
 * Cache health metrics for the tile prefetch scheduler (hits, misses,
 * evictions, byte usage, pending downloads). Surfaced in a debug overlay behind
 * a feature flag. Custom singleton store, matching the codebase pattern.
 */

export interface TileCacheStatsState {
  hits: number;
  misses: number;
  evictions: number;
  count: number;
  bytes: number;
  pending: number;
}

export type TileCacheAction =
  | { type: "CACHE_HIT" }
  | { type: "CACHE_MISS" }
  | { type: "TILE_STORED"; payload: { bytes: number } }
  | { type: "TILES_EVICTED"; payload: { count: number; freedBytes: number } }
  | { type: "PENDING_SET"; payload: { pending: number } }
  | { type: "RESET" };

const initialState: TileCacheStatsState = {
  hits: 0,
  misses: 0,
  evictions: 0,
  count: 0,
  bytes: 0,
  pending: 0,
};

type Listener = (state: TileCacheStatsState) => void;

class TileCacheStore {
  private state: TileCacheStatsState = initialState;
  private listeners = new Set<Listener>();

  getState = (): Readonly<TileCacheStatsState> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(action: TileCacheAction): void {
    const next = this.reducer(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.notify();
    }
  }

  private reducer(
    state: TileCacheStatsState,
    action: TileCacheAction
  ): TileCacheStatsState {
    switch (action.type) {
      case "CACHE_HIT":
        return { ...state, hits: state.hits + 1 };
      case "CACHE_MISS":
        return { ...state, misses: state.misses + 1 };
      case "TILE_STORED":
        return {
          ...state,
          count: state.count + 1,
          bytes: state.bytes + action.payload.bytes,
        };
      case "TILES_EVICTED":
        return {
          ...state,
          evictions: state.evictions + action.payload.count,
          count: Math.max(0, state.count - action.payload.count),
          bytes: Math.max(0, state.bytes - action.payload.freedBytes),
        };
      case "PENDING_SET":
        return { ...state, pending: Math.max(0, action.payload.pending) };
      case "RESET":
        return initialState;
      default:
        return state;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

/** Shared singleton tile-cache stats store. */
export const tileCacheStore = new TileCacheStore();

/** Cache hit ratio in [0, 1]; 0 when there have been no lookups. */
export function selectHitRatio(state: TileCacheStatsState): number {
  const total = state.hits + state.misses;
  return total === 0 ? 0 : state.hits / total;
}

export function useTileCacheStats(): TileCacheStatsState {
  return useSyncExternalStore(
    tileCacheStore.subscribe,
    tileCacheStore.getState,
    tileCacheStore.getState
  );
}
