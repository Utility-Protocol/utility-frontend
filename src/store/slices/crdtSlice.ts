"use client";

import { useSyncExternalStore } from "react";
import { orSetValues } from "@/utils/crdtMerge";
import {
  RECONCILE_TIMEOUT_MS,
  type ChainId,
  type ResourceDiff,
  type ResourceState,
  type VectorClock,
} from "@/types/crdt";

/**
 * Store holding the merged CRDT state, per-resource vector clocks, and the last
 * time each chain produced an update. A staleness watcher flags any chain that
 * has been silent past the reconcile timeout for a full state re-fetch.
 *
 * Custom singleton store, matching the codebase pattern.
 */

export interface CrdtState {
  resources: Record<string, ResourceState>;
  vectorClocks: Record<string, VectorClock>;
  /** Wall-clock ms each chain was last seen. */
  lastSeen: Partial<Record<ChainId, number>>;
  /** Chains currently flagged for a full snapshot re-fetch. */
  reconciling: ChainId[];
}

export type CrdtAction =
  | {
      type: "APPLY_DIFFS";
      payload: {
        diffs: ResourceDiff[];
        chainSeen: Partial<Record<ChainId, number>>;
        at: number;
      };
    }
  | { type: "CHAIN_SEEN"; payload: { chainId: ChainId; at: number } }
  | { type: "RECONCILE"; payload: { chainId: ChainId } }
  | { type: "RECONCILE_DONE"; payload: { chainId: ChainId } }
  | { type: "RESET" };

const initialState: CrdtState = {
  resources: {},
  vectorClocks: {},
  lastSeen: {},
  reconciling: [],
};

/** Chains whose last update is older than the reconcile timeout. */
export function findStaleChains(
  lastSeen: Partial<Record<ChainId, number>>,
  now: number,
  timeoutMs: number = RECONCILE_TIMEOUT_MS
): ChainId[] {
  const stale: ChainId[] = [];
  for (const [chainId, seenAt] of Object.entries(lastSeen) as [ChainId, number][]) {
    if (now - seenAt > timeoutMs) stale.push(chainId);
  }
  return stale;
}

type Listener = (state: CrdtState) => void;

class CrdtStore {
  private state: CrdtState = initialState;
  private listeners = new Set<Listener>();

  getState = (): Readonly<CrdtState> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(action: CrdtAction): void {
    const next = this.reducer(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.notify();
    }
  }

  private reducer(state: CrdtState, action: CrdtAction): CrdtState {
    switch (action.type) {
      case "APPLY_DIFFS": {
        const { diffs, chainSeen, at } = action.payload;
        if (diffs.length === 0 && Object.keys(chainSeen).length === 0) return state;
        const resources = { ...state.resources };
        const vectorClocks = { ...state.vectorClocks };
        for (const diff of diffs) {
          resources[diff.resourceId] = diff.state;
          vectorClocks[diff.resourceId] = diff.vectorClock;
        }
        const lastSeen = { ...state.lastSeen };
        for (const chainId of Object.keys(chainSeen) as ChainId[]) {
          lastSeen[chainId] = at;
        }
        // Any chain we just heard from is no longer stale.
        const reconciling = state.reconciling.filter(
          (c) => !(c in chainSeen)
        );
        return { ...state, resources, vectorClocks, lastSeen, reconciling };
      }
      case "CHAIN_SEEN":
        return {
          ...state,
          lastSeen: { ...state.lastSeen, [action.payload.chainId]: action.payload.at },
          reconciling: state.reconciling.filter((c) => c !== action.payload.chainId),
        };
      case "RECONCILE":
        if (state.reconciling.includes(action.payload.chainId)) return state;
        return {
          ...state,
          reconciling: [...state.reconciling, action.payload.chainId],
        };
      case "RECONCILE_DONE":
        return {
          ...state,
          reconciling: state.reconciling.filter((c) => c !== action.payload.chainId),
        };
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

/** Shared singleton CRDT store. */
export const crdtStore = new CrdtStore();

/** Flag any stale chains for reconciliation; returns the chains flagged. */
export function runStalenessWatch(
  now: number,
  timeoutMs: number = RECONCILE_TIMEOUT_MS
): ChainId[] {
  const stale = findStaleChains(crdtStore.getState().lastSeen, now, timeoutMs);
  for (const chainId of stale) {
    crdtStore.dispatch({ type: "RECONCILE", payload: { chainId } });
  }
  return stale;
}

// --- Selectors / bindings ---------------------------------------------------

/** Materialised value of a resource (scalar for LWW, array for OR-set). */
export function selectResourceValue(
  state: CrdtState,
  resourceId: string
): unknown {
  const resource = state.resources[resourceId];
  if (!resource) return undefined;
  return resource.kind === "lww"
    ? resource.value
    : orSetValues(resource as Parameters<typeof orSetValues>[0]);
}

export function useCrdtState(): CrdtState {
  return useSyncExternalStore(
    crdtStore.subscribe,
    crdtStore.getState,
    crdtStore.getState
  );
}
