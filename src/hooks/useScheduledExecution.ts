"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  getTimerWheel,
  type ScheduleHandle,
  type TimerWheelService,
} from "@/services/timerWheel";
import { scheduleStore } from "@/store/slices/scheduleSlice";
import type { FiredJob } from "@/types/scheduler";

/**
 * Component-level scheduling. Wraps {@link TimerWheelService}, mirrors job
 * metadata into {@link scheduleStore} for the dashboard, and auto-cancels every
 * job this component scheduled when it unmounts.
 */

export interface ScheduleRequest {
  /** Human-readable name for the dashboard. */
  name: string;
  handlerKey: string;
  handler: (fired: FiredJob) => void;
  /** Absolute fire time (unix ms). */
  fireAt: number;
  /** Recurrence interval (ms); omit for one-shot. */
  intervalMs?: number;
}

export interface UseScheduledExecutionResult {
  schedule: (request: ScheduleRequest) => string;
  cancel: (id: string) => void;
  /** Current main-thread → worker drift correction (ms). */
  drift: number;
  usingFallback: boolean;
}

export function useScheduledExecution(
  service: TimerWheelService = getTimerWheel()
): UseScheduledExecutionResult {
  const handlesRef = useRef<Map<string, ScheduleHandle>>(new Map());

  useEffect(() => {
    const handles = handlesRef.current;
    return () => {
      // Auto-cancel everything this component scheduled.
      for (const handle of handles.values()) handle.cancel();
      handles.clear();
    };
  }, []);

  const schedule = useCallback(
    (request: ScheduleRequest): string => {
      const { name, handlerKey, handler, fireAt, intervalMs } = request;
      const handle = service.schedule(
        handlerKey,
        (fired) => {
          handler(fired);
          scheduleStore.dispatch({
            type: "JOB_FIRED",
            payload: {
              id: fired.id,
              firedAt: fired.firedAt,
              nextFire: intervalMs ? fired.scheduledFor + intervalMs : fired.scheduledFor,
              missed: fired.missed,
            },
          });
          if (!intervalMs) handlesRef.current.delete(fired.id);
        },
        fireAt,
        intervalMs
      );

      handlesRef.current.set(handle.id, handle);
      scheduleStore.dispatch({
        type: "JOB_SCHEDULED",
        payload: {
          id: handle.id,
          handlerKey,
          name,
          nextFire: fireAt,
          intervalMs: intervalMs ?? null,
          status: "scheduled",
          missedCount: 0,
          lastFiredAt: null,
        },
      });
      return handle.id;
    },
    [service]
  );

  const cancel = useCallback(
    (id: string) => {
      handlesRef.current.get(id)?.cancel();
      handlesRef.current.delete(id);
      service.cancel(id);
      scheduleStore.dispatch({ type: "JOB_CANCELLED", payload: { id } });
    },
    [service]
  );

  return {
    schedule,
    cancel,
    drift: service.drift,
    usingFallback: service.usingFallback,
  };
}
