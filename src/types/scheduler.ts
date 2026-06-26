/**
 * Types and invariants for the high-resolution timer wheel that schedules
 * recurring Soroban contract executions with millisecond precision, resisting
 * background-tab throttling via a Web Worker and SharedArrayBuffer timekeeping.
 */

// --- Wheel invariants -------------------------------------------------------

/** Number of slots in the wheel. */
export const WHEEL_SLOTS = 1024;
/** Milliseconds each slot represents. */
export const SLOT_MS = 100;
/** Total wheel span (≈ 102.4 s). */
export const WHEEL_SPAN_MS = WHEEL_SLOTS * SLOT_MS;
/** Maximum concurrently scheduled jobs. */
export const MAX_JOBS = 1000;
/** Execution must land within ±this many ms of the scheduled fire-at time. */
export const PRECISION_TOLERANCE_MS = 50;
/** Polling interval used when SharedArrayBuffer is unavailable. */
export const FALLBACK_POLL_MS = 200;

// --- Jobs -------------------------------------------------------------------

/** A scheduling request. */
export interface TimerJob {
  id: string;
  /** Application handler key (the actual callback lives on the main thread). */
  handlerKey: string;
  /** Absolute wall-clock fire time (unix ms). */
  fireAt: number;
  /** Recurrence interval (ms); omitted/0 means one-shot. */
  intervalMs?: number;
}

/** Internal wheel bookkeeping layered on top of a {@link TimerJob}. */
export interface WheelJob extends TimerJob {
  /** Slot index the job currently sits in. */
  slot: number;
  /** Full wheel rotations remaining before the job is due. */
  rounds: number;
  /** Times the job fired later than the precision tolerance. */
  missedCount: number;
  /** Last time the job actually fired (unix ms), or null. */
  lastFiredAt: number | null;
}

/** A fired job reported back to the caller. */
export interface FiredJob {
  id: string;
  handlerKey: string;
  /** Scheduled fire-at. */
  scheduledFor: number;
  /** Wall-clock time it actually fired. */
  firedAt: number;
  /** firedAt − scheduledFor (ms); positive = late. */
  lateness: number;
  /** True when |lateness| exceeded the precision tolerance. */
  missed: boolean;
}

export type JobStatus = "scheduled" | "firing" | "done" | "cancelled";

/** Metadata tracked for the dashboard. */
export interface ScheduledJobMeta {
  id: string;
  handlerKey: string;
  name: string;
  nextFire: number;
  intervalMs: number | null;
  status: JobStatus;
  missedCount: number;
  lastFiredAt: number | null;
}

// --- SharedArrayBuffer layout (Int32) ---------------------------------------

/** 1024 × Int32 = 4 KiB control buffer. */
export const SAB_INT32_LENGTH = 1024;

export const SAB_INDEX = {
  /** Worker heartbeat counter (also the Atomics.wait futex word). */
  HEARTBEAT: 0,
  /** Main-thread-written drift correction (ms). */
  DRIFT: 1,
  /** Incremented by the main thread when a new command is posted. */
  COMMAND_SEQ: 2,
  /** 1 while the worker should keep running, 0 to stop. */
  RUNNING: 3,
  /** Worker's last observed clock (ms, truncated to int32). */
  LAST_NOW: 4,
} as const;

// --- Worker protocol --------------------------------------------------------

export type SchedulerCommand =
  | { type: "schedule"; job: TimerJob }
  | { type: "cancel"; jobId: string }
  | { type: "terminate" };

export type SchedulerEvent =
  | { type: "fired"; jobs: FiredJob[] }
  | { type: "ready"; shared: boolean }
  | { type: "error"; message: string };
