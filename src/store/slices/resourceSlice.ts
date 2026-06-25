"use client";

import { useSyncExternalStore } from "react";
import { fromRedux, type Decimal } from "@/utils/decimal";
import { sumReadings } from "@/utils/aggregation";
import {
  RESOURCE_PRECISION,
  type MeterReading,
  type ResourceKind,
  type SerializedMeterReading,
} from "@/types/meter";

/**
 * Resource consumption store. Readings are persisted in their string-encoded
 * {@link SerializedMeterReading} form so the state survives Redux DevTools /
 * JSON serialization without floating-point corruption. Decimals are rehydrated
 * only when a selector reads them.
 */

const RESOURCE_KINDS: ResourceKind[] = [
  "water",
  "electricity",
  "gas",
  "cost",
  "submeter",
  "nano",
];

export type ResourceState = Record<ResourceKind, SerializedMeterReading[]>;

export type ResourceAction =
  | { type: "ADD_READING"; payload: MeterReading }
  | { type: "ADD_READINGS"; payload: MeterReading[] }
  | { type: "CLEAR_RESOURCE"; payload: { resource: ResourceKind } }
  | { type: "RESET" };

function emptyState(): ResourceState {
  return RESOURCE_KINDS.reduce((acc, k) => {
    acc[k] = [];
    return acc;
  }, {} as ResourceState);
}

/** Serialize a reading for storage (string-encoded decimal value). */
export function serializeReading(reading: MeterReading): SerializedMeterReading {
  return {
    meterId: reading.meterId,
    resource: reading.resource,
    timestamp: reading.timestamp,
    value: reading.value.toRedux(),
  };
}

/** Rehydrate a stored reading back into a {@link MeterReading}. */
export function deserializeReading(s: SerializedMeterReading): MeterReading {
  return {
    meterId: s.meterId,
    resource: s.resource,
    timestamp: s.timestamp,
    value: fromRedux(s.value) as MeterReading["value"],
  };
}

type Listener = (state: ResourceState) => void;

class ResourceStore {
  private state: ResourceState = emptyState();
  private listeners = new Set<Listener>();

  getState = (): Readonly<ResourceState> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(action: ResourceAction): void {
    const next = this.reducer(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.notify();
    }
  }

  private reducer(state: ResourceState, action: ResourceAction): ResourceState {
    switch (action.type) {
      case "ADD_READING": {
        const r = action.payload;
        return {
          ...state,
          [r.resource]: [...state[r.resource], serializeReading(r)],
        };
      }
      case "ADD_READINGS": {
        if (action.payload.length === 0) return state;
        const next = { ...state };
        const grouped = new Map<ResourceKind, SerializedMeterReading[]>();
        for (const r of action.payload) {
          const list = grouped.get(r.resource) ?? [];
          list.push(serializeReading(r));
          grouped.set(r.resource, list);
        }
        for (const [resource, serialized] of grouped) {
          next[resource] = [...state[resource], ...serialized];
        }
        return next;
      }
      case "CLEAR_RESOURCE":
        return { ...state, [action.payload.resource]: [] };
      case "RESET":
        return emptyState();
      default:
        return state;
    }
  }

  private notify(): void {
    for (const listener of this.listeners) listener(this.state);
  }
}

/** Shared singleton resource store. */
export const resourceStore = new ResourceStore();

// --- Selectors --------------------------------------------------------------

/** Rehydrated readings for a resource. */
export function selectReadings(
  state: ResourceState,
  resource: ResourceKind
): MeterReading[] {
  return state[resource].map(deserializeReading);
}

/** Exact total for a resource at its canonical precision. */
export function selectTotal(
  state: ResourceState,
  resource: ResourceKind
): Decimal {
  return sumReadings(selectReadings(state, resource), RESOURCE_PRECISION[resource]);
}

// --- React bindings ---------------------------------------------------------

export function useResourceState(): ResourceState {
  return useSyncExternalStore(
    resourceStore.subscribe,
    resourceStore.getState,
    resourceStore.getState
  );
}

/** Subscribe to the rehydrated readings for a single resource. */
export function useResourceReadings(resource: ResourceKind): MeterReading[] {
  const state = useResourceState();
  return selectReadings(state, resource);
}
