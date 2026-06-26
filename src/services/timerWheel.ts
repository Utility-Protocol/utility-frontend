"use client";

import { TimerWheel } from "@/utils/timerWheelCore";
import {
  bumpCommandSeq,
  createTimerBuffer,
  isSharedArrayBufferAvailable,
  writeDrift,
  type TimerBuffer,
} from "@/utils/sharedBuffer";
import {
  FALLBACK_POLL_MS,
  SLOT_MS,
  type FiredJob,
  type SchedulerEvent,
  type TimerJob,
} from "@/types/scheduler";

/**
 * Main-thread facade for the timer wheel.
 *
 * Preferred path: a Web Worker holds the wheel and ticks via Atomics.wait over a
 * SharedArrayBuffer, immune to background-tab throttling. The main thread runs a
 * requestAnimationFrame loop that, while the tab is hidden, writes a drift
 * correction into the shared buffer. If SharedArrayBuffer (COOP/COEP) is
 * unavailable it degrades to a 200 ms polling loop on the main thread.
 */

export interface ScheduleHandle {
  id: string;
  cancel: () => void;
}

export interface TimerWheelDeps {
  createWorker?: () => Worker;
  now?: () => number;
  /** Schedule a rAF-like callback; defaults to requestAnimationFrame. */
  raf?: (cb: (t: number) => void) => number;
  cancelRaf?: (handle: number) => void;
  logger?: Pick<Console, "warn">;
}

type Handler = (fired: FiredJob) => void;

export class TimerWheelService {
  private buffer: TimerBuffer | null = null;
  private worker: Worker | null = null;
  private fallbackWheel: TimerWheel | null = null;
  private fallbackTimer: ReturnType<typeof setInterval> | null = null;
  private rafHandle: number | null = null;
  private readonly handlers = new Map<string, Handler>();
  private counter = 0;
  private started = false;
  private _drift = 0;

  constructor(private readonly deps: TimerWheelDeps = {}) {}

  get usingFallback(): boolean {
    return this.fallbackWheel !== null;
  }
  get drift(): number {
    return this._drift;
  }

  /** Initialise the worker (or the polling fallback). Idempotent. */
  start(): void {
    if (this.started) return;
    this.started = true;

    const canShare = isSharedArrayBufferAvailable();
    const createWorker = this.deps.createWorker;
    if (canShare && createWorker) {
      try {
        this.buffer = createTimerBuffer();
        this.worker = createWorker();
        this.worker.onmessage = (e: MessageEvent<SchedulerEvent>) =>
          this.onEvent(e.data);
        this.worker.postMessage({
          type: "init",
          buffer: this.buffer.buffer,
          shared: this.buffer.shared,
        });
        this.startDriftLoop();
        return;
      } catch {
        // fall through to polling
      }
    }

    (this.deps.logger ?? console).warn(
      "[timerWheel] SharedArrayBuffer/worker unavailable — falling back to 200 ms polling"
    );
    this.startFallback();
  }

  private startFallback(): void {
    const now = this.deps.now ?? Date.now;
    this.fallbackWheel = new TimerWheel(now());
    this.fallbackTimer = setInterval(() => {
      const fired = this.fallbackWheel!.advance(now());
      for (const job of fired) this.dispatch(job);
    }, FALLBACK_POLL_MS);
  }

  private startDriftLoop(): void {
    const raf =
      this.deps.raf ??
      (typeof requestAnimationFrame !== "undefined" ? requestAnimationFrame : null);
    if (!raf) return;
    const now = this.deps.now ?? Date.now;

    let lastTs = now();
    const frame = () => {
      const ts = now();
      const elapsed = ts - lastTs;
      lastTs = ts;
      // While hidden, rAF is throttled; the extra elapsed time is the drift the
      // worker should compensate its cursor by.
      const hidden =
        typeof document !== "undefined" && document.visibilityState === "hidden";
      this._drift = hidden ? Math.max(0, elapsed - SLOT_MS) : 0;
      if (this.buffer) writeDrift(this.buffer.view, this._drift);
      this.rafHandle = raf(frame);
    };
    this.rafHandle = raf(frame);
  }

  /** Schedule a job; returns a handle whose `cancel()` removes it. */
  schedule(
    handlerKey: string,
    handler: Handler,
    fireAt: number,
    intervalMs?: number
  ): ScheduleHandle {
    if (!this.started) this.start();
    const id = `job-${++this.counter}`;
    const job: TimerJob = { id, handlerKey, fireAt, intervalMs };
    this.handlers.set(id, handler);

    if (this.worker && this.buffer) {
      this.worker.postMessage({ type: "schedule", job });
      bumpCommandSeq(this.buffer.view); // wake the worker
    } else if (this.fallbackWheel) {
      this.fallbackWheel.schedule(job);
    }

    return { id, cancel: () => this.cancel(id) };
  }

  cancel(id: string): void {
    this.handlers.delete(id);
    if (this.worker && this.buffer) {
      this.worker.postMessage({ type: "cancel", jobId: id });
      bumpCommandSeq(this.buffer.view);
    } else if (this.fallbackWheel) {
      this.fallbackWheel.cancel(id);
    }
  }

  private onEvent(event: SchedulerEvent): void {
    if (event.type === "fired") {
      for (const job of event.jobs) this.dispatch(job);
    }
  }

  private dispatch(job: FiredJob): void {
    const handler = this.handlers.get(job.id);
    handler?.(job);
  }

  /** Tear everything down. */
  dispose(): void {
    if (this.worker && this.buffer) {
      this.worker.postMessage({ type: "terminate" });
      this.worker.terminate();
    }
    if (this.fallbackTimer !== null) clearInterval(this.fallbackTimer);
    const cancelRaf =
      this.deps.cancelRaf ??
      (typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : null);
    if (this.rafHandle !== null && cancelRaf) cancelRaf(this.rafHandle);
    this.handlers.clear();
    this.worker = null;
    this.buffer = null;
    this.fallbackWheel = null;
    this.fallbackTimer = null;
    this.rafHandle = null;
    this.started = false;
  }
}

let singleton: TimerWheelService | null = null;

/** Lazily-constructed shared service, wired to the bundled worker. */
export function getTimerWheel(): TimerWheelService {
  if (!singleton) {
    singleton = new TimerWheelService({
      createWorker: () =>
        new Worker(new URL("../workers/timerWheel.worker.ts", import.meta.url), {
          type: "module",
        }),
    });
  }
  return singleton;
}
