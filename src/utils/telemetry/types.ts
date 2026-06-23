/**
 * Shared types & invariants for the real-time telemetry streaming subsystem.
 *
 * Protocol recap (custom binary framing):
 *   [u16 sequence][payload: N x f32 series values]
 *
 * The sequence number is a `u16` and therefore wraps at 65535. On every fresh
 * WebSocket connection the remote counter resets to 0. The validator must be
 * able to distinguish a genuine dropped-frame gap from a connection epoch
 * reset, otherwise a single reconnect floods the chart with thousands of
 * synthetic points (the original 86s-freeze bug).
 */

/** u16 sequence space: values live in [0, 65535] and wrap modulo 65536. */
export const SEQUENCE_MODULUS = 0x10000;
export const SEQUENCE_MAX = 0xffff;

/** Half of the sequence space; a forward delta larger than this means the
 * frame actually arrived *behind* the high-water mark (a reorder / late frame). */
export const HALF_RANGE = SEQUENCE_MODULUS / 2;

/**
 * Max sequence gap that is still treated as a plausible in-stream drop before
 * we suspect a counter reset / re-baseline. (State invariant parameter.)
 */
export const MAX_GAP_BEFORE_RESET = 1000;

/**
 * Hard cap on the number of synthetic points we will ever insert for a single
 * gap. Beyond this we emit a single NaN sentinel that the renderer draws as a
 * disconnected line segment. 300 frames == 5s at 60fps, which keeps the chart
 * responsive instead of freezing for ~86s on a large reconnect gap.
 */
export const GAP_FILL_CAP = 300;

/** Maximum number of points retained per series in the chart data store. */
export const MAX_CHART_POINTS = 10_000;

/** Expected frame rate (updates per second) used for sizing/time math. */
export const FRAME_RATE_HZ = 60;

/** Sliding window size used by {@link SequenceTracker}. */
export const TRACKER_WINDOW_SIZE = 100;

/** A parsed telemetry frame. */
export interface TelemetryFrame {
  /** u16 sequence number from the wire. */
  sequence: number;
  /** One reading per series (CPU, memory, bandwidth, ...). */
  values: number[];
  /** Wall-clock ms when the frame was received. */
  receivedAt: number;
}

/**
 * A single point in a chart series. `NaN` is a sentinel meaning "gap
 * separator" (the renderer breaks the line). `synthetic` marks interpolated
 * points so they can be drawn with lower opacity / dashed strokes.
 */
export interface ChartPoint {
  value: number;
  synthetic: boolean;
  timestamp: number;
  /** u16 sequence this point corresponds to, or -1 for a sentinel/synthetic. */
  sequence: number;
}

/** Why a frame was classified the way it was by the validator. */
export type ValidationReason =
  | "accepted"
  | "duplicate"
  | "reordered"
  | "epoch-reset"
  | "interpolated"
  | "gap-separator";

/** Synthetic points the data store should insert before the accepted frame. */
export interface GapFillPoint {
  series: number;
  points: ChartPoint[];
}

/** Result of validating a single incoming frame. */
export interface ValidationResult {
  accepted: boolean;
  reason: ValidationReason;
  connectionId: string;
  /** Number of missing frames detected (0 when none). */
  gap: number;
  /** Per-series synthetic points to insert before this frame. */
  fills: GapFillPoint[];
}
