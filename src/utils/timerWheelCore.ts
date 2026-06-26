/**
 * Hashed timer wheel (Netty/Varghese & Lauck style) — the pure data structure
 * shared by the worker and the polling fallback, and the thing under test.
 *
 * 1,024 slots × 100 ms (≈102.4 s span). A job is hashed into a slot by its
 * fire-tick; jobs further out than one rotation carry a `rounds` counter that is
 * decremented each time the cursor passes their slot. Once a job's rotation is
 * complete it moves to a `pending` set and fires as soon as `now ≥ fireAt`,
 * which guarantees sub-slot jobs are never skipped.
 */

import {
  MAX_JOBS,
  PRECISION_TOLERANCE_MS,
  SLOT_MS,
  WHEEL_SLOTS,
  type FiredJob,
  type TimerJob,
  type WheelJob,
} from "@/types/scheduler";

export class TimerWheel {
  private readonly slots: Set<string>[];
  private readonly jobs = new Map<string, WheelJob>();
  /** Jobs whose rotation completed, awaiting their exact fire-at. */
  private readonly pending = new Set<string>();
  private currentTick: number;
  private drift = 0;

  constructor(startNow = 0) {
    this.slots = Array.from({ length: WHEEL_SLOTS }, () => new Set<string>());
    this.currentTick = Math.floor(startNow / SLOT_MS);
  }

  get size(): number {
    return this.jobs.size;
  }

  getJob(id: string): WheelJob | undefined {
    return this.jobs.get(id);
  }

  list(): WheelJob[] {
    return [...this.jobs.values()];
  }

  /** Apply a drift correction (ms) added to `now` on each advance. */
  setDrift(ms: number): void {
    this.drift = ms;
  }

  /** Schedule (or replace) a job. Throws past {@link MAX_JOBS}. */
  schedule(job: TimerJob): WheelJob {
    if (!this.jobs.has(job.id) && this.jobs.size >= MAX_JOBS) {
      throw new Error(`Timer wheel is full (max ${MAX_JOBS} jobs)`);
    }
    return this.place(job);
  }

  /** Cancel a job. Returns true if it existed. */
  cancel(id: string): boolean {
    const wj = this.jobs.get(id);
    if (!wj) return false;
    this.slots[wj.slot].delete(id);
    this.pending.delete(id);
    this.jobs.delete(id);
    return true;
  }

  private place(job: TimerJob): WheelJob {
    const prev = this.jobs.get(job.id);
    if (prev) {
      this.slots[prev.slot].delete(job.id);
      this.pending.delete(job.id);
    }

    const targetTick = Math.floor(job.fireAt / SLOT_MS);
    const slot = ((targetTick % WHEEL_SLOTS) + WHEEL_SLOTS) % WHEEL_SLOTS;
    const ticksAway = targetTick - this.currentTick;
    const rounds = ticksAway <= 0 ? 0 : Math.floor(ticksAway / WHEEL_SLOTS);

    const wj: WheelJob = {
      ...job,
      slot,
      rounds,
      missedCount: prev?.missedCount ?? 0,
      lastFiredAt: prev?.lastFiredAt ?? null,
    };
    this.jobs.set(job.id, wj);

    if (ticksAway <= 0) {
      this.pending.add(job.id);
    } else {
      this.slots[slot].add(job.id);
    }
    return wj;
  }

  /**
   * Advance the wheel to `now` (wall-clock ms) and return the jobs that fired.
   * Recurring jobs are rescheduled by `fireAt += intervalMs` (at most one fire
   * per advance, so being behind never triggers a catch-up storm).
   */
  advance(now: number): FiredJob[] {
    const clockNow = now + this.drift;
    const targetTick = Math.floor(clockNow / SLOT_MS);

    // Step the cursor; jobs whose rotation completes move to `pending`.
    while (this.currentTick < targetTick) {
      this.currentTick++;
      const slot = this.currentTick % WHEEL_SLOTS;
      for (const id of [...this.slots[slot]]) {
        const wj = this.jobs.get(id);
        if (!wj) {
          this.slots[slot].delete(id);
          continue;
        }
        if (wj.rounds > 0) {
          wj.rounds -= 1;
          continue;
        }
        this.slots[slot].delete(id);
        this.pending.add(id);
      }
    }

    // Fire pending jobs that have reached their fire-at.
    const fired: FiredJob[] = [];
    for (const id of [...this.pending]) {
      const wj = this.jobs.get(id);
      if (!wj) {
        this.pending.delete(id);
        continue;
      }
      if (wj.fireAt > clockNow) continue;

      this.pending.delete(id);
      const lateness = clockNow - wj.fireAt;
      const missed = Math.abs(lateness) > PRECISION_TOLERANCE_MS;
      if (missed) wj.missedCount += 1;
      wj.lastFiredAt = clockNow;

      fired.push({
        id: wj.id,
        handlerKey: wj.handlerKey,
        scheduledFor: wj.fireAt,
        firedAt: clockNow,
        lateness,
        missed,
      });

      if (wj.intervalMs && wj.intervalMs > 0) {
        // Reschedule for the next cadence tick (carries missed/lastFired over).
        this.place({
          id: wj.id,
          handlerKey: wj.handlerKey,
          fireAt: wj.fireAt + wj.intervalMs,
          intervalMs: wj.intervalMs,
        });
      } else {
        this.jobs.delete(id);
      }
    }
    return fired;
  }
}
