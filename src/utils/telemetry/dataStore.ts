import type { FrameValidator } from "./frameValidator";
import { MAX_CHART_POINTS } from "./types";
import type { ChartPoint, TelemetryFrame, ValidationReason } from "./types";

/**
 * In-memory chart data store (the "Chart.js reactive array" equivalent).
 *
 * Holds one ring-buffer per series, hard-capped at `maxPoints` (default 10 000)
 * via FIFO eviction. The store is mutated in place; consumers (the canvas
 * renderer) read `datasets` directly inside their animation-frame loop so we
 * avoid 60fps React re-renders.
 */
export class TelemetryDataStore {
  readonly datasets: ChartPoint[][];
  private version = 0;

  constructor(
    seriesCount: number,
    private readonly maxPoints: number = MAX_CHART_POINTS
  ) {
    const count = Math.max(1, seriesCount);
    this.datasets = Array.from({ length: count }, () => []);
  }

  get seriesCount(): number {
    return this.datasets.length;
  }

  /** Monotonic counter bumped whenever the data mutates. */
  get revision(): number {
    return this.version;
  }

  append(series: number, point: ChartPoint): void {
    const ds = this.datasets[series];
    if (!ds) return;
    ds.push(point);
    while (ds.length > this.maxPoints) ds.shift();
  }

  appendMany(series: number, points: ChartPoint[]): void {
    const ds = this.datasets[series];
    if (!ds) return;
    for (const p of points) ds.push(p);
    while (ds.length > this.maxPoints) ds.shift();
  }

  clear(): void {
    for (const ds of this.datasets) ds.length = 0;
    this.version += 1;
  }

  /** Signal a mutation occurred (used when callers mutate datasets directly). */
  bump(): void {
    this.version += 1;
  }

  /* ---- diagnostics ---- */

  lastPoint(series: number): ChartPoint | undefined {
    return this.datasets[series]?.[this.datasets[series].length - 1];
  }

  totalPoints(): number {
    return this.datasets.reduce((acc, ds) => acc + ds.length, 0);
  }

  /** Count of synthetic (interpolated / sentinel) points across all series. */
  syntheticPointCount(): number {
    let n = 0;
    for (const ds of this.datasets) {
      for (const p of ds) if (p.synthetic) n += 1;
    }
    return n;
  }

  /** Count of genuine, non-synthetic, non-NaN points (the "live" data). */
  realPointCount(): number {
    let n = 0;
    for (const ds of this.datasets) {
      for (const p of ds) {
        if (!p.synthetic && !Number.isNaN(p.value)) n += 1;
      }
    }
    return n;
  }
}

export function makePoint(
  value: number,
  synthetic: boolean,
  timestamp: number,
  sequence: number
): ChartPoint {
  return { value, synthetic, timestamp, sequence };
}

/**
 * Shared ingestion path: run a frame through the validator and append both the
 * synthetic fills and the real values to the store. Keeps the streaming hook
 * and the reconnect benchmark on exactly the same code path.
 */
export function ingestFrame(
  validator: FrameValidator,
  store: TelemetryDataStore,
  prevValues: number[],
  frame: TelemetryFrame
): { accepted: boolean; reason: ValidationReason } {
  const result = validator.validate(frame, prevValues);
  if (!result.accepted) {
    return { accepted: false, reason: result.reason };
  }
  for (const fill of result.fills) {
    store.appendMany(fill.series, fill.points);
  }
  const now = frame.receivedAt;
  for (let s = 0; s < frame.values.length; s++) {
    const value = frame.values[s];
    store.append(s, makePoint(value, false, now, frame.sequence));
    prevValues[s] = value;
  }
  store.bump();
  return { accepted: true, reason: result.reason };
}
