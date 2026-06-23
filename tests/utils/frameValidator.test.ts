import { describe, it, expect } from "vitest";
import {
  FrameValidator,
  SequenceTracker,
  forwardDelta,
  interpolate,
  median,
  medianAbsoluteDeviation,
} from "@/utils/telemetry/frameValidator";
import {
  TelemetryDataStore,
  ingestFrame,
} from "@/utils/telemetry/dataStore";
import { encodeFrame, parseFrame } from "@/utils/telemetry/binaryFraming";
import { HALF_RANGE } from "@/utils/telemetry/types";
import type { TelemetryFrame } from "@/utils/telemetry/types";

function frame(sequence: number, value: number): TelemetryFrame {
  return parseFrame(encodeFrame(sequence, [value]), 1);
}

function freshHarness() {
  const validator = new FrameValidator();
  const store = new TelemetryDataStore(1);
  const prevValues = [NaN];
  return { validator, store, prevValues };
}

describe("forwardDelta / median helpers", () => {
  it("computes modular forward delta with u16 wrap", () => {
    expect(forwardDelta(0, 1)).toBe(1);
    expect(forwardDelta(5, 5)).toBe(0);
    expect(forwardDelta(65535, 0)).toBe(1); // wrap
    expect(forwardDelta(100, 98)).toBe(65534); // behind -> > HALF_RANGE
    expect(forwardDelta(100, 98)).toBeGreaterThan(HALF_RANGE);
  });

  it("median + MAD", () => {
    expect(median([])).toBe(0);
    expect(median([5])).toBe(5);
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(medianAbsoluteDeviation([1, 1, 1, 1])).toBe(0);
    expect(medianAbsoluteDeviation([1, 3])).toBe(1);
  });

  it("interpolate averages prev/next with graceful fallbacks", () => {
    expect(interpolate(10, 20)).toBe(15);
    expect(interpolate(NaN, 20)).toBe(20);
    expect(interpolate(10, NaN)).toBe(10);
    expect(interpolate(NaN, NaN)).toBe(0);
  });
});

describe("SequenceTracker", () => {
  it("learns a +1 cadence and reports zero variability", () => {
    const t = new SequenceTracker();
    for (let i = 1; i <= 20; i++) t.push(i);
    expect(t.medianStep()).toBe(1);
    expect(t.mad()).toBe(0);
    expect(t.expectedMaxStep()).toBeGreaterThanOrEqual(1);
  });

  it("adapts to a new baseline after reset (within the window)", () => {
    const t = new SequenceTracker();
    for (let i = 1; i <= 50; i++) t.push(i);
    expect(t.contains(5)).toBe(true);
    t.reset();
    expect(t.contains(5)).toBe(false);
    expect(t.size).toBe(0);
    for (let i = 0; i < 100; i++) t.push(1000 + i);
    expect(t.medianStep()).toBe(1);
    expect(t.contains(1005)).toBe(true);
  });
});

describe("FrameValidator - epoch reset detection (THE bug fix)", () => {
  it("accepts the first frame of a new epoch with ANY sequence and no gap math", () => {
    const v = new FrameValidator();
    for (let s = 0; s <= 5201; s++) {
      v.validate(frame(s, s), [s === 0 ? NaN : s - 1]);
    }
    expect(v.lastSequenceNumber).toBe(5201);

    v.beginEpoch();
    expect(v.awaitingFirstFrame).toBe(true);

    // New stream resets its counter to 3. This MUST NOT be read as a 5198 drop.
    const result = v.validate(frame(3, 999), [NaN]);
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("epoch-reset");
    expect(result.gap).toBe(0);
    expect(result.fills).toHaveLength(1);
    expect(result.fills[0].points).toHaveLength(1);
    expect(Number.isNaN(result.fills[0].points[0].value)).toBe(true);
    expect(v.lastSequenceNumber).toBe(3);
  });

  it("does not flood the store with thousands of points on reset", () => {
    const { validator, store, prevValues } = freshHarness();
    for (let s = 0; s <= 5201; s++) {
      ingestFrame(validator, store, prevValues, frame(s, s));
    }
    const before = store.datasets[0].length;

    validator.beginEpoch();
    prevValues[0] = NaN;
    ingestFrame(validator, store, prevValues, frame(3, 999));

    const after = store.datasets[0].length;
    expect(after - before).toBe(2);
    expect(store.syntheticPointCount()).toBe(1);
    expect(after).toBeLessThan(before + 10);
    const last = store.lastPoint(0)!;
    expect(last.value).toBe(999);
    expect(last.synthetic).toBe(false);
  });
});

describe("FrameValidator - decimated interpolation", () => {
  it("fills small gaps with (prev+next)/2 synthetic points", () => {
    const { validator, store, prevValues } = freshHarness();
    ingestFrame(validator, store, prevValues, frame(0, 10));
    ingestFrame(validator, store, prevValues, frame(1, 20));
    const result = validator.validate(frame(6, 30), prevValues);
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("interpolated");
    expect(result.gap).toBe(4);
    expect(result.fills[0].points).toHaveLength(4);
    for (const p of result.fills[0].points) {
      expect(p.value).toBe(25);
      expect(p.synthetic).toBe(true);
    }
  });

  it("caps gaps larger than 300 to a single NaN sentinel", () => {
    const { validator, store, prevValues } = freshHarness();
    ingestFrame(validator, store, prevValues, frame(0, 10));
    const before = store.datasets[0].length;

    // A single ingest both classifies and mutates the store.
    const outcome = ingestFrame(validator, store, prevValues, frame(500, 50));
    const after = store.datasets[0].length;

    expect(outcome.accepted).toBe(true);
    expect(outcome.reason).toBe("gap-separator");
    // ONE sentinel + ONE real point only (never 499 synthetic nulls).
    expect(after - before).toBe(2);
    expect(Number.isNaN(store.datasets[0][before].value)).toBe(true);
    expect(store.datasets[0][before].synthetic).toBe(true);
    expect(store.datasets[0][after - 1].value).toBe(50);
  });

  it("treats gaps > 1000 as an effective reset (epoch-reset reason)", () => {
    const v = new FrameValidator();
    v.validate(frame(0, 1), [NaN]);
    const result = v.validate(frame(6000, 2), [1]);
    expect(result.accepted).toBe(true);
    expect(result.reason).toBe("epoch-reset");
    expect(result.fills[0].points).toHaveLength(1);
    expect(Number.isNaN(result.fills[0].points[0].value)).toBe(true);
  });
});

describe("FrameValidator - wrap, duplicate, reorder", () => {
  it("handles u16 wrap (65535 -> 0) as a nominal next frame", () => {
    const v = new FrameValidator();
    expect(v.validate(frame(65534, 1), [NaN]).reason).toBe("epoch-reset");
    expect(v.validate(frame(65535, 2), [1]).reason).toBe("accepted");
    expect(v.validate(frame(0, 3), [2]).reason).toBe("accepted");
    expect(v.validate(frame(1, 4), [3]).reason).toBe("accepted");
    expect(v.lastSequenceNumber).toBe(1);
  });

  it("drops exact duplicate frames", () => {
    const v = new FrameValidator();
    v.validate(frame(5, 1), [NaN]);
    const dup = v.validate(frame(5, 1), [1]);
    expect(dup.accepted).toBe(false);
    expect(dup.reason).toBe("duplicate");
  });

  it("classifies late/reordered frames without moving the high-water mark", () => {
    const v = new FrameValidator();
    v.validate(frame(10, 1), [NaN]);
    v.validate(frame(11, 2), [1]);
    v.validate(frame(12, 3), [2]);
    const late = v.validate(frame(11, 99), [3]);
    expect(late.accepted).toBe(true);
    expect(late.reason).toBe("reordered");
    expect(late.fills).toHaveLength(0);
    expect(v.lastSequenceNumber).toBe(12);
    expect(v.validate(frame(13, 4), [3]).reason).toBe("accepted");
  });
});

describe("FrameValidator - connection epoch bookkeeping", () => {
  it("mints a new monotonic connectionId on every beginEpoch", () => {
    const v = new FrameValidator();
    const first = v.connectionEpochId;
    v.beginEpoch();
    const second = v.connectionEpochId;
    v.beginEpoch();
    const third = v.connectionEpochId;
    expect(first).not.toBe(second);
    expect(second).not.toBe(third);
    expect(v.epoch).toBe(2);
  });

  it("first-ever epoch inserts no boundary sentinel (no prior data)", () => {
    const v = new FrameValidator();
    const result = v.validate(frame(42, 1), [NaN]);
    expect(result.reason).toBe("epoch-reset");
    expect(result.fills).toHaveLength(0);
  });
});
