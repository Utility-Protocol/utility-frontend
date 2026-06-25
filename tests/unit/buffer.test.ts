import { describe, it, expect } from "vitest";
import {
  RingBuffer,
  StreamBatcher,
  AdaptiveCapacityMonitor,
  MAX_POINTS,
  MIN_POINTS,
} from "@/utils/buffer";

describe("RingBuffer", () => {
  it("defaults to MAX_POINTS capacity", () => {
    expect(new RingBuffer().capacity).toBe(MAX_POINTS);
  });

  it("retains pushed values in order", () => {
    const b = new RingBuffer(4);
    b.push(1);
    b.push(2);
    b.push(3);
    expect(b.toArray()).toEqual([1, 2, 3]);
    expect(b.size).toBe(3);
  });

  it("drops the oldest values past capacity", () => {
    const b = new RingBuffer(3);
    [1, 2, 3, 4, 5].forEach((v) => b.push(v));
    expect(b.toArray()).toEqual([3, 4, 5]);
  });

  it("pushBatch keeps only the most recent capacity", () => {
    const b = new RingBuffer(3);
    b.pushBatch([1, 2, 3, 4, 5]);
    expect(b.toArray()).toEqual([3, 4, 5]);
    b.pushBatch([]); // no-op
    expect(b.toArray()).toEqual([3, 4, 5]);
  });

  it("setCapacity shrinks to the newest values", () => {
    const b = new RingBuffer(5);
    b.pushBatch([1, 2, 3, 4, 5]);
    b.setCapacity(2);
    expect(b.toArray()).toEqual([4, 5]);
    expect(b.capacity).toBe(2);
  });

  it("rejects non-positive capacity", () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(2).setCapacity(-1)).toThrow();
  });

  it("clear empties the buffer", () => {
    const b = new RingBuffer(3);
    b.push(1);
    b.clear();
    expect(b.size).toBe(0);
  });
});

describe("StreamBatcher", () => {
  function controllableClock() {
    let t = 0;
    return { now: () => t, advance: (ms: number) => (t += ms) };
  }

  it("accumulates writes and flushes once the interval elapses", () => {
    const clock = controllableClock();
    const buffer = new RingBuffer(100);
    const batcher = new StreamBatcher(buffer, { intervalMs: 50, now: clock.now });

    batcher.write(1);
    batcher.write(2);
    expect(batcher.pending).toBe(2);
    expect(buffer.size).toBe(0); // not flushed yet

    clock.advance(50);
    batcher.write(3); // crosses the interval → flush
    expect(buffer.toArray()).toEqual([1, 2, 3]);
    expect(batcher.pending).toBe(0);
  });

  it("flushDue only flushes when the interval has elapsed", () => {
    const clock = controllableClock();
    const buffer = new RingBuffer(100);
    const batcher = new StreamBatcher(buffer, { intervalMs: 50, now: clock.now });

    batcher.write(1);
    batcher.flushDue();
    expect(buffer.size).toBe(0); // too soon
    clock.advance(50);
    batcher.flushDue();
    expect(buffer.toArray()).toEqual([1]);
  });

  it("force flush empties the pending batch", () => {
    const buffer = new RingBuffer(100);
    const batcher = new StreamBatcher(buffer, { intervalMs: 50, now: () => 0 });
    batcher.write(7);
    batcher.flush();
    expect(buffer.toArray()).toEqual([7]);
  });
});

describe("AdaptiveCapacityMonitor", () => {
  it("starts at the max capacity", () => {
    expect(new AdaptiveCapacityMonitor().capacity).toBe(MAX_POINTS);
  });

  it("shrinks after consecutive slow frames", () => {
    const m = new AdaptiveCapacityMonitor({ step: 25, slowFramesToShrink: 2 });
    m.record(40); // slow #1 — no change yet
    expect(m.capacity).toBe(MAX_POINTS);
    const cap = m.record(40); // slow #2 — shrink
    expect(cap).toBe(MAX_POINTS - 25);
  });

  it("does not shrink below the floor", () => {
    const m = new AdaptiveCapacityMonitor({
      step: 50,
      slowFramesToShrink: 1,
      min: MIN_POINTS,
    });
    for (let i = 0; i < 20; i++) m.record(100);
    expect(m.capacity).toBe(MIN_POINTS);
  });

  it("grows back after sustained healthy frames", () => {
    const m = new AdaptiveCapacityMonitor({
      step: 25,
      slowFramesToShrink: 1,
      fastFramesToGrow: 5,
    });
    m.record(40); // shrink to 175
    expect(m.capacity).toBe(175);
    for (let i = 0; i < 5; i++) m.record(10); // healthy run → grow
    expect(m.capacity).toBe(200);
  });

  it("a fast frame resets the slow streak", () => {
    const m = new AdaptiveCapacityMonitor({ slowFramesToShrink: 2 });
    m.record(40); // slow #1
    m.record(10); // healthy → resets streak
    m.record(40); // slow #1 again (not #2)
    expect(m.capacity).toBe(MAX_POINTS);
  });
});
