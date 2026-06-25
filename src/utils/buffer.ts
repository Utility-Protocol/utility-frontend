/**
 * Streaming buffer primitives for the high-frequency telemetry view.
 *
 * Data ingestion (WebSocket bursts of 50+ msg/s) is decoupled from the canvas
 * draw loop: incoming points are accumulated by a {@link StreamBatcher} and
 * flushed into a fixed-capacity {@link RingBuffer} every {@link BATCH_INTERVAL}.
 * The draw loop reads the ring buffer at the display refresh rate. An
 * {@link AdaptiveCapacityMonitor} shrinks the buffer when frames run slow.
 */

/** Maximum retained points in the ring buffer. */
export const MAX_POINTS = 200;
/** Batch flush cadence (ms). */
export const BATCH_INTERVAL = 50;
/** Frame time (ms) above which the view is considered to be dropping frames. */
export const SLOW_FRAME_MS = 33; // < 30 FPS
/** Floor the adaptive monitor will not shrink below. */
export const MIN_POINTS = 50;

/**
 * Fixed-capacity ring of numbers. Pushing past capacity drops the oldest
 * values (`slice(-capacity)`), so the buffer always holds the most recent
 * window. Capacity can shrink/grow at runtime (the CPU monitor uses this).
 */
export class RingBuffer {
  private data: number[] = [];
  private cap: number;

  constructor(capacity: number = MAX_POINTS) {
    if (capacity <= 0) throw new Error("RingBuffer capacity must be positive");
    this.cap = capacity;
  }

  get capacity(): number {
    return this.cap;
  }

  get size(): number {
    return this.data.length;
  }

  /** Append a single value, evicting the oldest if at capacity. */
  push(value: number): void {
    this.data.push(value);
    if (this.data.length > this.cap) {
      this.data = this.data.slice(-this.cap);
    }
  }

  /** Append many values at once, keeping only the most recent `capacity`. */
  pushBatch(values: number[]): void {
    if (values.length === 0) return;
    this.data = this.data.concat(values);
    if (this.data.length > this.cap) {
      this.data = this.data.slice(-this.cap);
    }
  }

  /** Snapshot of the retained values (oldest → newest). */
  toArray(): number[] {
    return this.data.slice();
  }

  /** Resize the capacity, trimming to the newest values if it shrank. */
  setCapacity(capacity: number): void {
    if (capacity <= 0) throw new Error("RingBuffer capacity must be positive");
    this.cap = capacity;
    if (this.data.length > capacity) {
      this.data = this.data.slice(-capacity);
    }
  }

  clear(): void {
    this.data = [];
  }
}

export interface StreamBatcherOptions {
  intervalMs?: number;
  /** Injectable clock (ms) for deterministic tests. */
  now?: () => number;
}

/**
 * Accumulates incoming points and flushes them into a {@link RingBuffer} no
 * more than once per `intervalMs`, smoothing high-frequency bursts before they
 * reach the render path.
 */
export class StreamBatcher {
  private batch: number[] = [];
  private lastFlush: number;
  private readonly intervalMs: number;
  private readonly now: () => number;

  constructor(
    private readonly buffer: RingBuffer,
    options: StreamBatcherOptions = {}
  ) {
    this.intervalMs = options.intervalMs ?? BATCH_INTERVAL;
    this.now = options.now ?? Date.now;
    this.lastFlush = this.now();
  }

  /** Pending (un-flushed) point count. */
  get pending(): number {
    return this.batch.length;
  }

  /** Queue a point; flushes inline once the interval has elapsed. */
  write(value: number): void {
    this.batch.push(value);
    if (this.now() - this.lastFlush >= this.intervalMs) {
      this.flush();
    }
  }

  /** Flush if the interval has elapsed (called from the draw loop). */
  flushDue(): void {
    if (this.batch.length > 0 && this.now() - this.lastFlush >= this.intervalMs) {
      this.flush();
    }
  }

  /** Force-flush the pending batch into the ring buffer. */
  flush(): void {
    if (this.batch.length > 0) {
      this.buffer.pushBatch(this.batch);
      this.batch = [];
    }
    this.lastFlush = this.now();
  }
}

export interface AdaptiveCapacityOptions {
  max?: number;
  min?: number;
  thresholdMs?: number;
  /** Points to add/remove per adjustment. */
  step?: number;
  /** Consecutive slow frames before shrinking. */
  slowFramesToShrink?: number;
  /** Consecutive healthy frames before growing back. */
  fastFramesToGrow?: number;
}

/**
 * Recommends a ring-buffer capacity from observed frame times: it shrinks the
 * window after sustained slow frames (> {@link SLOW_FRAME_MS}) and grows it back
 * once the frame rate recovers, keeping the draw loop above ~30 FPS.
 */
export class AdaptiveCapacityMonitor {
  private current: number;
  private slowStreak = 0;
  private fastStreak = 0;
  private readonly max: number;
  private readonly min: number;
  private readonly thresholdMs: number;
  private readonly step: number;
  private readonly slowFramesToShrink: number;
  private readonly fastFramesToGrow: number;

  constructor(options: AdaptiveCapacityOptions = {}) {
    this.max = options.max ?? MAX_POINTS;
    this.min = options.min ?? MIN_POINTS;
    this.thresholdMs = options.thresholdMs ?? SLOW_FRAME_MS;
    this.step = options.step ?? 25;
    this.slowFramesToShrink = options.slowFramesToShrink ?? 2;
    this.fastFramesToGrow = options.fastFramesToGrow ?? 30;
    this.current = this.max;
  }

  get capacity(): number {
    return this.current;
  }

  /** Feed a frame's duration (ms); returns the recommended capacity. */
  record(frameMs: number): number {
    if (frameMs > this.thresholdMs) {
      this.slowStreak += 1;
      this.fastStreak = 0;
      if (this.slowStreak >= this.slowFramesToShrink) {
        this.current = Math.max(this.min, this.current - this.step);
        this.slowStreak = 0;
      }
    } else {
      this.fastStreak += 1;
      this.slowStreak = 0;
      if (this.fastStreak >= this.fastFramesToGrow) {
        this.current = Math.min(this.max, this.current + this.step);
        this.fastStreak = 0;
      }
    }
    return this.current;
  }
}
