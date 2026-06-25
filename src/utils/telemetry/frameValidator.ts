import {
  GAP_FILL_CAP,
  HALF_RANGE,
  MAX_GAP_BEFORE_RESET,
  SEQUENCE_MODULUS,
  TRACKER_WINDOW_SIZE,
} from "./types";
import type {
  ChartPoint,
  GapFillPoint,
  TelemetryFrame,
  ValidationReason,
  ValidationResult,
} from "./types";

/* ------------------------------------------------------------------ *
 * Pure sequence helpers
 * ------------------------------------------------------------------ */

/**
 * Forward (modular) distance from `prev` to `next` across the u16 wrap.
 * Always returns a value in [0, 65535]. Values larger than {@link HALF_RANGE}
 * mean `next` is effectively *behind* `prev` (a late / reordered frame).
 */
export function forwardDelta(prev: number, next: number): number {
  return (((next - prev) % SEQUENCE_MODULUS) + SEQUENCE_MODULUS) % SEQUENCE_MODULUS;
}

/** Median of a numeric sample (0 for empty input). */
export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** Median Absolute Deviation of `values` around their median. */
export function medianAbsoluteDeviation(values: number[]): number {
  if (values.length === 0) return 0;
  const med = median(values);
  return median(values.map((v) => Math.abs(v - med)));
}

/** RFC4122-ish UUID, with a safe fallback when `crypto.randomUUID` is absent. */
export function safeUUID(): string {
  try {
    const c = globalThis.crypto as Crypto | undefined;
    if (c && typeof c.randomUUID === "function") return c.randomUUID();
  } catch {
    /* fall through to manual generation */
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/* ------------------------------------------------------------------ *
 * SequenceTracker — robust, adaptive gap detection
 * ------------------------------------------------------------------ */

/**
 * Maintains a sliding window of the last `capacity` sequence numbers and uses
 * median-absolute-deviation (MAD) statistics to reason about gaps.
 *
 * Because the window is rebuilt after every reconnect, the tracker *learns the
 * new baseline within 100 frames* and adapts, instead of relying on a single
 * raw `lastSequence` subtraction (which is what caused the original bug).
 */
export class SequenceTracker {
  private window: number[] = [];

  constructor(private readonly capacity: number = TRACKER_WINDOW_SIZE) {}

  reset(): void {
    this.window = [];
  }

  push(sequence: number): void {
    this.window.push(sequence);
    while (this.window.length > this.capacity) this.window.shift();
  }

  get size(): number {
    return this.window.length;
  }

  /** True when `sequence` is already present in the recent window (reorder/dup). */
  contains(sequence: number): boolean {
    return this.window.includes(sequence);
  }

  /** Median forward step between consecutive observed sequences. */
  medianStep(): number {
    const deltas = this.deltas();
    return deltas.length === 0 ? 1 : median(deltas);
  }

  /** MAD of the per-frame forward deltas — robust spread of the stream cadence. */
  mad(): number {
    const deltas = this.deltas();
    return deltas.length === 0 ? 0 : medianAbsoluteDeviation(deltas);
  }

  /**
   * Largest forward step still considered "in stream noise". Built from the
   * learned cadence (median step) plus a robust 3*MAD-sigma band. This is what
   * downstream code uses instead of a raw subtraction to flag anomalies.
   */
  expectedMaxStep(): number {
    const step = this.medianStep();
    const variability = this.mad();
    const sigmaBand = 3 * 1.4826 * variability;
    return Math.max(step, Math.round(step + (Number.isFinite(sigmaBand) ? sigmaBand : 0)));
  }

  private deltas(): number[] {
    const out: number[] = [];
    for (let i = 1; i < this.window.length; i++) {
      out.push(forwardDelta(this.window[i - 1], this.window[i]));
    }
    return out;
  }
}

/* ------------------------------------------------------------------ *
 * FrameValidator — epoch detection + decimated gap-fill
 * ------------------------------------------------------------------ */

export interface FrameValidatorOptions {
  /** Max synthetic points inserted per gap before a NaN sentinel is used. */
  gapFillCap?: number;
  /** Gap above which a mid-stream jump is treated as a reset/re-baseline. */
  maxGapBeforeReset?: number;
  /** Sliding-window size for the internal {@link SequenceTracker}. */
  windowSize?: number;
}

/**
 * Validates incoming telemetry frames and decides what (if anything) to insert
 * into the chart data store before the frame's own values.
 *
 * Key behaviours that resolve the reconnect-freeze issue:
 *  1. Stream epoch detection — on every `onopen` a new monotonic `connectionId`
 *     is minted. The first frame of a fresh epoch accepts ANY sequence number
 *     and performs NO gap math, so `lastSequence=5201 -> newSequence=3` is no
 *     longer read as a 5198-frame drop.
 *  2. Decimated interpolation — small in-stream gaps (<= gapFillCap) are filled
 *     with `(prevValue + nextValue) / 2`, each tagged `synthetic: true`.
 *  3. Hard cap + NaN sentinel — gaps beyond the cap emit a single NaN sentinel
 *     per series (rendered as a disconnected segment) instead of thousands of
 *     synthetic points.
 *  4. Reorder / duplicate awareness via {@link SequenceTracker}.
 */
export class FrameValidator {
  private readonly tracker: SequenceTracker;
  private lastSequence: number | null = null;
  private newConnection = true;
  private hadPriorEpoch = false;
  private connectionId: string;
  private connectionCounter = 0;
  private epochCount = 0;

  private readonly gapFillCap: number;
  private readonly maxGapBeforeReset: number;

  constructor(options: FrameValidatorOptions = {}) {
    this.gapFillCap = options.gapFillCap ?? GAP_FILL_CAP;
    this.maxGapBeforeReset = options.maxGapBeforeReset ?? MAX_GAP_BEFORE_RESET;
    this.tracker = new SequenceTracker(options.windowSize ?? TRACKER_WINDOW_SIZE);
    this.connectionId = this.generateConnectionId();
  }

  /** Current connection epoch identifier (changes on every `beginEpoch`). */
  get connectionEpochId(): string {
    return this.connectionId;
  }

  /** Monotonically increasing epoch ordinal (0 before first frame). */
  get epoch(): number {
    return this.epochCount;
  }

  get lastSequenceNumber(): number | null {
    return this.lastSequence;
  }

  /** True until the first frame of the current epoch is observed. */
  get awaitingFirstFrame(): boolean {
    return this.newConnection;
  }

  /** Exposed for diagnostics/tests. */
  get stats(): {
    medianStep: number;
    mad: number;
    expectedMaxStep: number;
    windowSize: number;
  } {
    return {
      medianStep: this.tracker.medianStep(),
      mad: this.tracker.mad(),
      expectedMaxStep: this.tracker.expectedMaxStep(),
      windowSize: this.tracker.size,
    };
  }

  /**
   * Called from the WebSocket `onopen` handler. Starts a new connection epoch:
   * mints a fresh monotonic `connectionId`, clears the tracker so it re-learns
   * the baseline, and arms the "first frame accepts any sequence" rule.
   */
  beginEpoch(): string {
    this.hadPriorEpoch = this.lastSequence !== null;
    this.newConnection = true;
    this.tracker.reset();
    this.connectionId = this.generateConnectionId();
    this.epochCount += 1;
    return this.connectionId;
  }

  /**
   * Validate a frame.
   *
   * @param frame parsed telemetry frame.
   * @param prevValues last *real* value per series (NaN when unknown). Used to
   *   compute interpolation values; the streaming hook maintains this array.
   */
  validate(frame: TelemetryFrame, prevValues: number[]): ValidationResult {
    const seq = frame.sequence;
    const seriesCount = Math.max(frame.values.length, prevValues.length, 1);

    /* (1) First frame of a fresh connection epoch: accept ANY sequence. */
    if (this.newConnection) {
      this.newConnection = false;
      const fills: GapFillPoint[] = this.hadPriorEpoch
        ? this.buildSentinelFills(seriesCount) // one NaN per series => visual break
        : [];
      this.hadPriorEpoch = false;
      this.lastSequence = seq;
      this.tracker.reset();
      this.tracker.push(seq);
      return {
        accepted: true,
        reason: "epoch-reset",
        connectionId: this.connectionId,
        gap: 0,
        fills,
      };
    }

    const last = this.lastSequence ?? seq;
    const delta = forwardDelta(last, seq);

    /* (2) Exact duplicate: drop. */
    if (delta === 0) {
      return {
        accepted: false,
        reason: "duplicate",
        connectionId: this.connectionId,
        gap: 0,
        fills: [],
      };
    }

    /* (3) Late / reordered frame: behind the high-water mark (or already seen).
     *     Accept the value but do NOT advance the high-water mark or gap-fill. */
    if (delta > HALF_RANGE || this.tracker.contains(seq)) {
      this.tracker.push(seq);
      return {
        accepted: true,
        reason: "reordered",
        connectionId: this.connectionId,
        gap: 0,
        fills: [],
      };
    }

    const missing = delta - 1;

    /* (4) No gap: nominal next frame. */
    if (missing === 0) {
      this.advance(seq);
      return {
        accepted: true,
        reason: "accepted",
        connectionId: this.connectionId,
        gap: 0,
        fills: [],
      };
    }

    /* (5) Small in-stream gap: decimated interpolation. */
    if (delta <= this.gapFillCap) {
      const fills = this.buildInterpolatedFills(seriesCount, missing, prevValues, frame);
      this.advance(seq);
      return {
        accepted: true,
        reason: "interpolated",
        connectionId: this.connectionId,
        gap: missing,
        fills,
      };
    }

    /* (6) Gap too large to interpolate: single NaN sentinel per series and
     *     re-baseline. A delta beyond `maxGapBeforeReset` is reported as an
     *     epoch-reset (effective counter reset detected mid-stream). */
    const reason: ValidationReason =
      delta > this.maxGapBeforeReset ? "epoch-reset" : "gap-separator";
    const fills = this.buildSentinelFills(seriesCount);
    this.advance(seq);
    return {
      accepted: true,
      reason,
      connectionId: this.connectionId,
      gap: missing,
      fills,
    };
  }

  private advance(seq: number): void {
    this.lastSequence = seq;
    this.tracker.push(seq);
  }

  private generateConnectionId(): string {
    this.connectionCounter += 1;
    return `conn-${this.connectionCounter}-${safeUUID()}`;
  }

  private buildInterpolatedFills(
    seriesCount: number,
    missing: number,
    prevValues: number[],
    frame: TelemetryFrame
  ): GapFillPoint[] {
    const fills: GapFillPoint[] = [];
    const baseTs = frame.receivedAt;
    const count = Math.min(missing, this.gapFillCap);
    for (let s = 0; s < seriesCount; s++) {
      const prev = prevValues[s];
      const next = frame.values[s] ?? prev;
      const interpolated = interpolate(prev, next);
      const points: ChartPoint[] = new Array(count);
      for (let i = 0; i < count; i++) {
        points[i] = {
          value: interpolated,
          synthetic: true,
          timestamp: baseTs,
          sequence: -1,
        };
      }
      fills.push({ series: s, points });
    }
    return fills;
  }

  private buildSentinelFills(seriesCount: number): GapFillPoint[] {
    const fills: GapFillPoint[] = [];
    for (let s = 0; s < seriesCount; s++) {
      fills.push({
        series: s,
        points: [{ value: NaN, synthetic: true, timestamp: 0, sequence: -1 }],
      });
    }
    return fills;
  }
}

/** (prevValue + nextValue) / 2, falling back gracefully to whichever is known. */
export function interpolate(prev: number, next: number): number {
  const hasPrev = Number.isFinite(prev);
  const hasNext = Number.isFinite(next);
  if (hasPrev && hasNext) return (prev + next) / 2;
  if (hasNext) return next;
  if (hasPrev) return prev;
  return 0;
}
