/**
 * SharedArrayBuffer creation and atomic-access helpers for the timer wheel's
 * cross-worker timekeeping (heartbeat, drift correction, command signalling).
 *
 * SharedArrayBuffer requires cross-origin isolation (COOP/COEP). When it is
 * unavailable the buffer degrades to a plain ArrayBuffer: atomic loads/stores
 * still work, but {@link futexWait} cannot block, so the worker falls back to a
 * timed loop and the main thread to polling.
 */

import { SAB_INDEX, SAB_INT32_LENGTH } from "@/types/scheduler";

export interface TimerBuffer {
  buffer: SharedArrayBuffer | ArrayBuffer;
  view: Int32Array;
  /** True when backed by a real SharedArrayBuffer (atomic blocking works). */
  shared: boolean;
}

/** Whether real cross-thread shared memory is available. */
export function isSharedArrayBufferAvailable(): boolean {
  return (
    typeof SharedArrayBuffer !== "undefined" &&
    // crossOriginIsolated is undefined in workers/node; treat absence as "ok".
    (typeof crossOriginIsolated === "undefined" || crossOriginIsolated === true)
  );
}

/** Allocate the 4 KiB control buffer (shared when possible). */
export function createTimerBuffer(): TimerBuffer {
  const bytes = SAB_INT32_LENGTH * 4;
  if (isSharedArrayBufferAvailable()) {
    const buffer = new SharedArrayBuffer(bytes);
    return { buffer, view: new Int32Array(buffer), shared: true };
  }
  const buffer = new ArrayBuffer(bytes);
  return { buffer, view: new Int32Array(buffer), shared: false };
}

/** Wrap an existing (transferred) buffer in a typed view. */
export function viewOf(buffer: SharedArrayBuffer | ArrayBuffer): TimerBuffer {
  return {
    buffer,
    view: new Int32Array(buffer),
    shared: typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer,
  };
}

// --- Field accessors (atomic) ----------------------------------------------

export function writeDrift(view: Int32Array, driftMs: number): void {
  Atomics.store(view, SAB_INDEX.DRIFT, Math.trunc(driftMs));
}
export function readDrift(view: Int32Array): number {
  return Atomics.load(view, SAB_INDEX.DRIFT);
}

export function setRunning(view: Int32Array, running: boolean): void {
  Atomics.store(view, SAB_INDEX.RUNNING, running ? 1 : 0);
}
export function isRunning(view: Int32Array): boolean {
  return Atomics.load(view, SAB_INDEX.RUNNING) === 1;
}

export function writeLastNow(view: Int32Array, now: number): void {
  Atomics.store(view, SAB_INDEX.LAST_NOW, Math.trunc(now) | 0);
}
export function readLastNow(view: Int32Array): number {
  return Atomics.load(view, SAB_INDEX.LAST_NOW);
}

/** Bump the command sequence and wake the worker. Returns the new sequence. */
export function bumpCommandSeq(view: Int32Array): number {
  const next = Atomics.add(view, SAB_INDEX.COMMAND_SEQ, 1) + 1;
  futexNotify(view, SAB_INDEX.HEARTBEAT);
  return next;
}
export function readCommandSeq(view: Int32Array): number {
  return Atomics.load(view, SAB_INDEX.COMMAND_SEQ);
}

export function incrementHeartbeat(view: Int32Array): number {
  return Atomics.add(view, SAB_INDEX.HEARTBEAT, 1) + 1;
}

/** Wake any threads blocked on `index`. No-op semantics on non-shared buffers. */
export function futexNotify(view: Int32Array, index: number, count = 1): number {
  try {
    return Atomics.notify(view, index, count);
  } catch {
    return 0; // non-shared buffer
  }
}

/**
 * Block until `index` changes from `expected` or `timeoutMs` elapses. On a
 * non-shared buffer Atomics.wait throws; we report "not-equal" so the caller
 * falls back to a timed loop.
 */
export function futexWait(
  view: Int32Array,
  index: number,
  expected: number,
  timeoutMs: number
): "ok" | "timed-out" | "not-equal" {
  try {
    return Atomics.wait(view, index, expected, timeoutMs);
  } catch {
    return "not-equal";
  }
}
