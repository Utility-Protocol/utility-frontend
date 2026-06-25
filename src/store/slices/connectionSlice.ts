"use client";

import { useSyncExternalStore } from "react";
import {
  HEARTBEAT_TIMEOUT_MS,
  type ConnectionQuality,
  type ConnectionStatus,
} from "@/types/connection";

/**
 * Connection state store (custom singleton, matching the codebase's store
 * pattern). UI components subscribe via {@link useConnectionState} and react to
 * status transitions — e.g. dimming charts while reconnecting or showing the
 * terminal-failure banner.
 */

export interface ConnectionState {
  status: ConnectionStatus;
  quality: ConnectionQuality;
  /** Sticky backend node id, if assigned. */
  nodeId: string | null;
  /** Last measured round-trip latency in ms (-1 when unknown). */
  latency: number;
  missedHeartbeats: number;
  /** Current reconnection attempt (0 when healthy). */
  attempt: number;
  /** Scheduled delay before the next reconnect attempt, if any. */
  nextDelayMs: number | null;
  lastError: string | null;
}

export type ConnectionAction =
  | {
      type: "CONNECTION_STATUS_CHANGED";
      payload: { status: ConnectionStatus; attempt?: number; nextDelayMs?: number | null };
    }
  | { type: "HEARTBEAT_LATENCY"; payload: { latency: number } }
  | { type: "HEARTBEAT_MISSED"; payload: { missedHeartbeats: number } }
  | { type: "NODE_ID_ASSIGNED"; payload: { nodeId: string } }
  | { type: "CONNECTION_FAILED"; payload: { error: string } }
  | { type: "CONNECTION_RECOVERED" }
  | { type: "RESET" };

const initialState: ConnectionState = {
  status: "idle",
  quality: "down",
  nodeId: null,
  latency: -1,
  missedHeartbeats: 0,
  attempt: 0,
  nextDelayMs: null,
  lastError: null,
};

/** Derive the coarse green/yellow/red quality from the detailed state. */
export function deriveQuality(
  status: ConnectionStatus,
  missedHeartbeats: number,
  latency: number
): ConnectionQuality {
  if (status === "failed") return "down";
  if (status === "connected") {
    if (missedHeartbeats > 0 || latency > HEARTBEAT_TIMEOUT_MS) return "degraded";
    return "good";
  }
  if (status === "connecting" || status === "reconnecting" || status === "recovering") {
    return "degraded";
  }
  return "down"; // idle
}

type Listener = (state: ConnectionState) => void;

class ConnectionStore {
  private state: ConnectionState = { ...initialState };
  private listeners = new Set<Listener>();

  getState = (): Readonly<ConnectionState> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(action: ConnectionAction): void {
    const next = this.reducer(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.notify();
    }
  }

  private reducer(state: ConnectionState, action: ConnectionAction): ConnectionState {
    switch (action.type) {
      case "CONNECTION_STATUS_CHANGED": {
        const status = action.payload.status;
        const attempt = action.payload.attempt ?? state.attempt;
        const nextDelayMs =
          action.payload.nextDelayMs !== undefined
            ? action.payload.nextDelayMs
            : state.nextDelayMs;
        const missedHeartbeats = status === "connected" ? 0 : state.missedHeartbeats;
        return {
          ...state,
          status,
          attempt,
          nextDelayMs,
          missedHeartbeats,
          lastError: status === "connected" ? null : state.lastError,
          quality: deriveQuality(status, missedHeartbeats, state.latency),
        };
      }
      case "HEARTBEAT_LATENCY":
        return {
          ...state,
          latency: action.payload.latency,
          quality: deriveQuality(state.status, state.missedHeartbeats, action.payload.latency),
        };
      case "HEARTBEAT_MISSED":
        return {
          ...state,
          missedHeartbeats: action.payload.missedHeartbeats,
          quality: deriveQuality(state.status, action.payload.missedHeartbeats, state.latency),
        };
      case "NODE_ID_ASSIGNED":
        return { ...state, nodeId: action.payload.nodeId };
      case "CONNECTION_FAILED":
        return {
          ...state,
          status: "failed",
          quality: "down",
          nextDelayMs: null,
          lastError: action.payload.error,
        };
      case "CONNECTION_RECOVERED":
        return {
          ...state,
          status: "connected",
          attempt: 0,
          missedHeartbeats: 0,
          nextDelayMs: null,
          lastError: null,
          quality: deriveQuality("connected", 0, state.latency),
        };
      case "RESET":
        return { ...initialState };
      default:
        return state;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

/** Singleton connection store instance. */
export const connectionStore = new ConnectionStore();

/** React binding: subscribe a component to the connection state. */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(
    connectionStore.subscribe,
    connectionStore.getState,
    connectionStore.getState
  );
}
