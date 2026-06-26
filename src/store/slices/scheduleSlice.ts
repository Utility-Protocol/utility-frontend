"use client";

import { useSyncExternalStore } from "react";
import type { ScheduledJobMeta } from "@/types/scheduler";

/**
 * Tracks scheduled-job metadata for the dashboard (next fire time, status,
 * missed-fire count). Custom singleton store, matching the codebase pattern.
 */

export type ScheduleState = Record<string, ScheduledJobMeta>;

export type ScheduleAction =
  | { type: "JOB_SCHEDULED"; payload: ScheduledJobMeta }
  | { type: "JOB_FIRED"; payload: { id: string; firedAt: number; nextFire: number; missed: boolean } }
  | { type: "JOB_CANCELLED"; payload: { id: string } }
  | { type: "JOB_REMOVED"; payload: { id: string } }
  | { type: "RESET" };

type Listener = (state: ScheduleState) => void;

class ScheduleStore {
  private state: ScheduleState = {};
  private listeners = new Set<Listener>();

  getState = (): Readonly<ScheduleState> => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch(action: ScheduleAction): void {
    const next = this.reducer(this.state, action);
    if (next !== this.state) {
      this.state = next;
      this.notify();
    }
  }

  private reducer(state: ScheduleState, action: ScheduleAction): ScheduleState {
    switch (action.type) {
      case "JOB_SCHEDULED":
        return { ...state, [action.payload.id]: action.payload };
      case "JOB_FIRED": {
        const job = state[action.payload.id];
        if (!job) return state;
        return {
          ...state,
          [job.id]: {
            ...job,
            lastFiredAt: action.payload.firedAt,
            nextFire: action.payload.nextFire,
            missedCount: job.missedCount + (action.payload.missed ? 1 : 0),
            // A recurring job stays scheduled; a one-shot is done.
            status: job.intervalMs ? "scheduled" : "done",
          },
        };
      }
      case "JOB_CANCELLED": {
        const job = state[action.payload.id];
        if (!job) return state;
        return { ...state, [job.id]: { ...job, status: "cancelled" } };
      }
      case "JOB_REMOVED": {
        if (!state[action.payload.id]) return state;
        const next = { ...state };
        delete next[action.payload.id];
        return next;
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

/** Shared singleton schedule store. */
export const scheduleStore = new ScheduleStore();

/** All jobs as an array (sorted by next fire time). */
export function selectJobs(state: ScheduleState): ScheduledJobMeta[] {
  return Object.values(state).sort((a, b) => a.nextFire - b.nextFire);
}

/** Number of jobs that have missed at least one fire. */
export function selectMissedCount(state: ScheduleState): number {
  return Object.values(state).reduce((n, j) => n + (j.missedCount > 0 ? 1 : 0), 0);
}

export function useSchedule(): ScheduleState {
  return useSyncExternalStore(
    scheduleStore.subscribe,
    scheduleStore.getState,
    scheduleStore.getState
  );
}
