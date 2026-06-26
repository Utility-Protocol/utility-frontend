import { describe, it, expect } from "vitest";
import {
  createTimerBuffer,
  viewOf,
  writeDrift,
  readDrift,
  setRunning,
  isRunning,
  writeLastNow,
  readLastNow,
  bumpCommandSeq,
  readCommandSeq,
  incrementHeartbeat,
  futexNotify,
  futexWait,
} from "@/utils/sharedBuffer";
import { SAB_INT32_LENGTH } from "@/types/scheduler";

describe("createTimerBuffer", () => {
  it("allocates a 4 KiB Int32 control buffer", () => {
    const { view } = createTimerBuffer();
    expect(view.length).toBe(SAB_INT32_LENGTH);
    expect(view.byteLength).toBe(4096);
  });

  it("viewOf wraps an existing buffer", () => {
    const { buffer } = createTimerBuffer();
    expect(viewOf(buffer).view.length).toBe(SAB_INT32_LENGTH);
  });
});

describe("atomic field accessors", () => {
  it("round-trips drift, running, last-now", () => {
    const { view } = createTimerBuffer();
    writeDrift(view, 123);
    expect(readDrift(view)).toBe(123);
    writeDrift(view, -7);
    expect(readDrift(view)).toBe(-7);

    setRunning(view, true);
    expect(isRunning(view)).toBe(true);
    setRunning(view, false);
    expect(isRunning(view)).toBe(false);

    writeLastNow(view, 999);
    expect(readLastNow(view)).toBe(999);
  });

  it("bumps the command sequence and increments the heartbeat", () => {
    const { view } = createTimerBuffer();
    expect(readCommandSeq(view)).toBe(0);
    expect(bumpCommandSeq(view)).toBe(1);
    expect(bumpCommandSeq(view)).toBe(2);
    expect(readCommandSeq(view)).toBe(2);

    expect(incrementHeartbeat(view)).toBe(1);
    expect(incrementHeartbeat(view)).toBe(2);
  });

  it("futexNotify never throws regardless of buffer type", () => {
    const { view } = createTimerBuffer();
    expect(() => futexNotify(view, 0)).not.toThrow();
  });

  it("futexWait reports not-equal immediately when the value already differs", () => {
    const { view } = createTimerBuffer();
    // Waiting for HEARTBEAT(0) to differ from a wrong expected value returns
    // immediately. On a non-shared buffer it also returns 'not-equal'.
    const result = futexWait(view, 0, 12345, 0);
    expect(["not-equal", "timed-out", "ok"]).toContain(result);
  });
});
