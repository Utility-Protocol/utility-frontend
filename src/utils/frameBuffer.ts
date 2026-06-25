/**
 * Fixed-capacity circular buffer of telemetry frames used to replay recent data
 * during the reconnection recovery handshake. Pushing past capacity overwrites
 * the oldest frame (the operator only needs the most recent window to recover).
 */

import { FRAME_BUFFER_CAPACITY, type TelemetryFrame } from "@/types/connection";

export class FrameBuffer {
  private readonly buffer: (TelemetryFrame | undefined)[];
  private readonly capacity: number;
  /** Index of the next write slot. */
  private head = 0;
  /** Number of frames currently stored (≤ capacity). */
  private count = 0;
  /** Highest sequence id seen, or -1 when empty. */
  private highestSeq = -1;

  constructor(capacity: number = FRAME_BUFFER_CAPACITY) {
    if (capacity <= 0) throw new Error("FrameBuffer capacity must be positive");
    this.capacity = capacity;
    this.buffer = new Array<TelemetryFrame | undefined>(capacity);
  }

  /** Number of frames retained. */
  get size(): number {
    return this.count;
  }

  /** True once the ring has wrapped and is overwriting old frames. */
  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /** Highest sequence id pushed, or -1 if the buffer is empty. */
  get lastSequenceId(): number {
    return this.highestSeq;
  }

  /** Append a frame, evicting the oldest if at capacity. */
  push(frame: TelemetryFrame): void {
    this.buffer[this.head] = frame;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count += 1;
    }
    if (frame.sequenceId > this.highestSeq) {
      this.highestSeq = frame.sequenceId;
    }
  }

  /** Return retained frames in chronological (oldest → newest) order. */
  toArray(): TelemetryFrame[] {
    const out: TelemetryFrame[] = [];
    // The oldest element is `count` slots behind head (mod capacity).
    const start = (this.head - this.count + this.capacity) % this.capacity;
    for (let i = 0; i < this.count; i++) {
      const frame = this.buffer[(start + i) % this.capacity];
      if (frame) out.push(frame);
    }
    return out;
  }

  /**
   * Drain the buffer: return all retained frames (oldest → newest) and clear
   * the ring. `highestSeq` is preserved so the next recovery handshake can still
   * report the last sequence id the client observed.
   */
  drain(): TelemetryFrame[] {
    const frames = this.toArray();
    this.buffer.fill(undefined);
    this.head = 0;
    this.count = 0;
    return frames;
  }

  /** Approximate total bytes retained (sum of frame sizes). */
  byteLength(): number {
    let total = 0;
    for (const frame of this.buffer) {
      if (frame) total += frame.size;
    }
    return total;
  }

  /** Reset the buffer and forget the high-water sequence id. */
  clear(): void {
    this.buffer.fill(undefined);
    this.head = 0;
    this.count = 0;
    this.highestSeq = -1;
  }
}
