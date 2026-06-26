import { describe, it, expect, beforeEach } from "vitest";
import {
  scheduleStore,
  selectJobs,
  selectMissedCount,
} from "@/store/slices/scheduleSlice";
import type { ScheduledJobMeta } from "@/types/scheduler";

function meta(id: string, nextFire: number, intervalMs: number | null = null): ScheduledJobMeta {
  return {
    id,
    handlerKey: "h",
    name: `Job ${id}`,
    nextFire,
    intervalMs,
    status: "scheduled",
    missedCount: 0,
    lastFiredAt: null,
  };
}

beforeEach(() => scheduleStore.dispatch({ type: "RESET" }));

describe("scheduleStore", () => {
  it("adds scheduled jobs", () => {
    scheduleStore.dispatch({ type: "JOB_SCHEDULED", payload: meta("a", 1000) });
    expect(selectJobs(scheduleStore.getState())).toHaveLength(1);
  });

  it("sorts jobs by next fire time", () => {
    scheduleStore.dispatch({ type: "JOB_SCHEDULED", payload: meta("late", 3000) });
    scheduleStore.dispatch({ type: "JOB_SCHEDULED", payload: meta("early", 1000) });
    expect(selectJobs(scheduleStore.getState()).map((j) => j.id)).toEqual([
      "early",
      "late",
    ]);
  });

  it("updates next fire and keeps a recurring job scheduled", () => {
    scheduleStore.dispatch({ type: "JOB_SCHEDULED", payload: meta("r", 1000, 1000) });
    scheduleStore.dispatch({
      type: "JOB_FIRED",
      payload: { id: "r", firedAt: 1005, nextFire: 2000, missed: false },
    });
    const job = scheduleStore.getState()["r"];
    expect(job.status).toBe("scheduled");
    expect(job.nextFire).toBe(2000);
    expect(job.lastFiredAt).toBe(1005);
  });

  it("marks a one-shot job done after firing", () => {
    scheduleStore.dispatch({ type: "JOB_SCHEDULED", payload: meta("one", 1000) });
    scheduleStore.dispatch({
      type: "JOB_FIRED",
      payload: { id: "one", firedAt: 1005, nextFire: 1000, missed: false },
    });
    expect(scheduleStore.getState()["one"].status).toBe("done");
  });

  it("increments missed count and reports it", () => {
    scheduleStore.dispatch({ type: "JOB_SCHEDULED", payload: meta("m", 1000, 1000) });
    scheduleStore.dispatch({
      type: "JOB_FIRED",
      payload: { id: "m", firedAt: 1200, nextFire: 2000, missed: true },
    });
    expect(scheduleStore.getState()["m"].missedCount).toBe(1);
    expect(selectMissedCount(scheduleStore.getState())).toBe(1);
  });

  it("cancels and removes jobs", () => {
    scheduleStore.dispatch({ type: "JOB_SCHEDULED", payload: meta("c", 1000) });
    scheduleStore.dispatch({ type: "JOB_CANCELLED", payload: { id: "c" } });
    expect(scheduleStore.getState()["c"].status).toBe("cancelled");
    scheduleStore.dispatch({ type: "JOB_REMOVED", payload: { id: "c" } });
    expect(scheduleStore.getState()["c"]).toBeUndefined();
  });
});
