"use client";

import { useSyncExternalStore } from "react";
import type { LoadStatus, NetworkEdge } from "@/types/network";

/**
 * UI state for the utility-network layer: visibility and a load-status filter.
 * Toggling either dispatches an action that the map component observes to
 * re-bind the layer's vertex buffer (via `UtilityNetworkLayer.setEdges`).
 *
 * Custom singleton store, matching the codebase's store pattern.
 */

const ALL_STATUSES: LoadStatus[] = ["nominal", "overloaded", "idle"];

export interface NetworkUIState {
  visible: boolean;
  /** Load statuses currently shown. */
  statusFilter: LoadStatus[];
}

export type NetworkAction =
  | { type: "TOGGLE_NETWORK_VISIBILITY" }
  | { type: "SET_NETWORK_VISIBILITY"; payload: { visible: boolean } }
  | { type: "SET_STATUS_FILTER"; payload: { statuses: LoadStatus[] } }
  | { type: "RESET" };

const initialState: NetworkUIState = {
  visible: true,
  statusFilter: ALL_STATUSES.slice(),
};

/** Apply the UI state to an edge set (visibility + status filter). */
export function filterEdges(
  edges: NetworkEdge[],
  state: NetworkUIState
): NetworkEdge[] {
  if (!state.visible) return [];
  if (state.statusFilter.length === ALL_STATUSES.length) return edges;
  const allowed = new Set(state.statusFilter);
  return edges.filter((e) => allowed.has(e.loadStatus));
}

type Listener = (state: NetworkUIState) => void;

class NetworkStore {
  private state: NetworkUIState = { ...initialState };
  private listeners = new Set<Listener>();

  getState = (): Readonly<NetworkUIState> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(action: NetworkAction): void {
    const next = this.reducer(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.notify();
    }
  }

  private reducer(state: NetworkUIState, action: NetworkAction): NetworkUIState {
    switch (action.type) {
      case "TOGGLE_NETWORK_VISIBILITY":
        return { ...state, visible: !state.visible };
      case "SET_NETWORK_VISIBILITY":
        return { ...state, visible: action.payload.visible };
      case "SET_STATUS_FILTER":
        return { ...state, statusFilter: action.payload.statuses.slice() };
      case "RESET":
        return { ...initialState, statusFilter: ALL_STATUSES.slice() };
      default:
        return state;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

/** Shared singleton network-UI store. */
export const networkStore = new NetworkStore();

/** Redux-style action creator for toggling visibility. */
export function toggleNetworkVisibility(): void {
  networkStore.dispatch({ type: "TOGGLE_NETWORK_VISIBILITY" });
}

/** Set the visible load-status filter. */
export function setStatusFilter(statuses: LoadStatus[]): void {
  networkStore.dispatch({ type: "SET_STATUS_FILTER", payload: { statuses } });
}

export function useNetworkUI(): NetworkUIState {
  return useSyncExternalStore(
    networkStore.subscribe,
    networkStore.getState,
    networkStore.getState
  );
}
