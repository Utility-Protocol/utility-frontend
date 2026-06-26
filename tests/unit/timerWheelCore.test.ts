import { describe, it, expect } from "vitest";
import { TimerWheel } from "@/utils/timerWheelCore";
import {
  MAX_JOBS,
  WHEEL_SPAN_MS,
  PRECISION_TOLERANCE_MS,
  type TimerJob,
} from "@/types/scheduler";

function job(id: string, fireAt: number, intervalMs?: number): TimerJob {
  return { id, handlerKey: id, fireAt, intervalMs };
}

describe("TimerWheel scheduling", () => {
  it("fires a one-shot job when time reaches its fire-at", () => {
    const w = new TimerWheel(0);
    w.schedule(job("a", 500));
    expect(w.advance(400)).toEqual([]); // not yet
    const fired = w.advance(550);
    expect(fired.map((f) => f.id)).toEqual(["a"]);
    expect(fired[0].scheduledFor).toBe(500);
    expect(w.size).toBe(0); // one-shot removed
  });

  it("fires jobs in fire-at order", () => {
    const w = new TimerWheel(0);
    w.schedule(job("late", 900));
    w.schedule(job("early", 300));
    const fired = w.advance(1000).map((f) => f.id);
    expect(fired).toEqual(["early", "late"]);
  });

  it("fires a job scheduled in the past immediately on next advance", () => {
    const w = new TimerWheel(1000);
    w.schedule(job("past", 500));
    expect(w.advance(1000).map((f) => f.id)).toEqual(["past"]);
  });

  it("handles jobs beyond one wheel rotation (rounds)", () => {
    const w = new TimerWheel(0);
    const farFuture = WHEEL_SPAN_MS + 5000; // > 102.4 s out
    w.schedule(job("far", farFuture));
    expect(w.advance(WHEEL_SPAN_MS).length).toBe(0); // a full rotation, not yet
    expect(w.advance(farFuture + 50).map((f) => f.id)).toEqual(["far"]);
  });
});

describe("TimerWheel recurrence", () => {
  it("reschedules a recurring job by its interval", () => {
    const w = new TimerWheel(0);
    w.schedule(job("r", 1000, 1000));
    expect(w.advance(1000).map((f) => f.id)).toEqual(["r"]);
    expect(w.advance(1500).length).toBe(0); // before the next cadence
    expect(w.advance(2000).map((f) => f.id)).toEqual(["r"]);
    expect(w.advance(3000).map((f) => f.id)).toEqual(["r"]);
  });

  it("fires a recurring job at most once per advance (no catch-up storm)", () => {
    const w = new TimerWheel(0);
    w.schedule(job("r", 100, 100));
    // Jump far ahead; should fire once, then again next advance, not 50×.
    expect(w.advance(5000).map((f) => f.id)).toEqual(["r"]);
    expect(w.advance(5000).map((f) => f.id)).toEqual(["r"]);
  });
});

describe("TimerWheel cancellation & capacity", () => {
  it("cancels a scheduled job", () => {
    const w = new TimerWheel(0);
    w.schedule(job("c", 500));
    expect(w.cancel("c")).toBe(true);
    expect(w.advance(1000)).toEqual([]);
    expect(w.cancel("c")).toBe(false);
  });

  it("replacing an existing id keeps the job count stable", () => {
    const w = new TimerWheel(0);
    w.schedule(job("x", 500));
    w.schedule(job("x", 800));
    expect(w.size).toBe(1);
    expect(w.advance(1000).map((f) => f.id)).toEqual(["x"]);
  });

  it("throws past the max-jobs cap", () => {
    const w = new TimerWheel(0);
    for (let i = 0; i < MAX_JOBS; i++) w.schedule(job(`j${i}`, 1000 + i));
    expect(() => w.schedule(job("overflow", 2000))).toThrow(/full/);
    // Replacing an existing id is still allowed.
    expect(() => w.schedule(job("j0", 3000))).not.toThrow();
  });
});

describe("TimerWheel precision & drift", () => {
  it("flags a fire as missed when late beyond the tolerance", () => {
    const w = new TimerWheel(0);
    w.schedule(job("m", 100));
    const fired = w.advance(100 + PRECISION_TOLERANCE_MS + 10);
    expect(fired[0].missed).toBe(true);
    expect(w.getJob("m")).toBeUndefined(); // one-shot removed
  });

  it("does not flag an on-time fire", () => {
    const w = new TimerWheel(0);
    w.schedule(job("ok", 100));
    expect(w.advance(110)[0].missed).toBe(false);
  });

  it("applies a drift correction to the clock", () => {
    const w = new TimerWheel(0);
    w.schedule(job("d", 1000));
    w.setDrift(60); // worker is 60 ms behind real time
    // Real now 950, +60 drift → effective 1010 → fires.
    expect(w.advance(950).map((f) => f.id)).toEqual(["d"]);
  });
});
