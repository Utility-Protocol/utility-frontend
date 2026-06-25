import { describe, it, expect } from "vitest";
import { FrameBuffer } from "@/utils/frameBuffer";
import type { TelemetryFrame } from "@/types/connection";

function frame(seq: number, size = 100): TelemetryFrame {
  return { sequenceId: seq, data: { v: seq }, receivedAt: seq, size };
}

describe("FrameBuffer", () => {
  it("retains frames in chronological order", () => {
    const buf = new FrameBuffer(4);
    buf.push(frame(1));
    buf.push(frame(2));
    buf.push(frame(3));
    expect(buf.size).toBe(3);
    expect(buf.toArray().map((f) => f.sequenceId)).toEqual([1, 2, 3]);
  });

  it("evicts the oldest frames once full (ring behaviour)", () => {
    const buf = new FrameBuffer(3);
    [1, 2, 3, 4, 5].forEach((s) => buf.push(frame(s)));
    expect(buf.isFull).toBe(true);
    expect(buf.size).toBe(3);
    expect(buf.toArray().map((f) => f.sequenceId)).toEqual([3, 4, 5]);
  });

  it("tracks the highest sequence id", () => {
    const buf = new FrameBuffer(3);
    buf.push(frame(10));
    buf.push(frame(11));
    expect(buf.lastSequenceId).toBe(11);
  });

  it("drains all frames and clears, preserving lastSequenceId", () => {
    const buf = new FrameBuffer(5);
    [1, 2, 3].forEach((s) => buf.push(frame(s)));
    const drained = buf.drain();
    expect(drained.map((f) => f.sequenceId)).toEqual([1, 2, 3]);
    expect(buf.size).toBe(0);
    expect(buf.toArray()).toEqual([]);
    // lastSequenceId survives a drain so the next recovery handshake is correct.
    expect(buf.lastSequenceId).toBe(3);
  });

  it("sums byte sizes", () => {
    const buf = new FrameBuffer(5);
    buf.push(frame(1, 200));
    buf.push(frame(2, 300));
    expect(buf.byteLength()).toBe(500);
  });

  it("clear() resets the high-water mark", () => {
    const buf = new FrameBuffer(5);
    buf.push(frame(7));
    buf.clear();
    expect(buf.size).toBe(0);
    expect(buf.lastSequenceId).toBe(-1);
  });

  it("rejects a non-positive capacity", () => {
    expect(() => new FrameBuffer(0)).toThrow();
  });

  it("defaults to a capacity of 500", () => {
    const buf = new FrameBuffer();
    for (let i = 0; i < 600; i++) buf.push(frame(i));
    expect(buf.size).toBe(500);
    expect(buf.toArray()[0].sequenceId).toBe(100); // oldest 100 evicted
  });
});
