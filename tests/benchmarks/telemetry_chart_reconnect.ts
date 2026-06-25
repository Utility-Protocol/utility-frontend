/**
 * Reconnect benchmark for the telemetry chart.
 *
 * Simulates 10 reconnection cycles, each with a server-side counter reset
 * (sequence jumps back to a small number after a fresh TCP connection), and
 * measures the time until the chart data store holds *live* data again.
 *
 * Target: each reconnect cycle must surface live data in < 500ms. Because the
 * validator emits at most a single NaN sentinel per reset (never thousands of
 * synthetic points), every cycle completes in microseconds.
 *
 * Run directly with:  npx tsx tests/benchmarks/telemetry_chart_reconnect.ts
 * (or exercised via the test suite through {@link simulateReconnectCycles}).
 */

import { encodeFrame, parseFrame } from "@/utils/telemetry/binaryFraming";
import { FrameValidator } from "@/utils/telemetry/frameValidator";
import {
  TelemetryDataStore,
  ingestFrame,
} from "@/utils/telemetry/dataStore";

export interface ReconnectBenchmarkOptions {
  cycles?: number;
  framesPerCycle?: number;
  seriesCount?: number;
  /** Mid-stream gap injected each cycle to exercise the NaN-sentinel path. */
  midStreamGap?: number;
}

export interface ReconnectBenchmarkResult {
  cycles: number;
  /** Worst-case ms to surface the first live point after a reconnect. */
  maxLatencyMs: number;
  avgLatencyMs: number;
  /** Largest number of synthetic points inserted during a single reset. */
  maxSyntheticPerReset: number;
  totalRealPoints: number;
  totalSyntheticPoints: number;
  /** True when every cycle's live-data latency is under `targetMs`. */
  passed: boolean;
  targetMs: number;
}

const DEFAULT_CYCLES = 10;
const DEFAULT_FRAMES_PER_CYCLE = 60; // ~1s of stream per cycle at 60fps
const TARGET_MS = 500;

/**
 * Pure benchmark core (no I/O). Drives the exact same ingestion path
 * (FrameValidator -> TelemetryDataStore) the streaming hook uses.
 */
export function simulateReconnectCycles(
  options: ReconnectBenchmarkOptions = {}
): ReconnectBenchmarkResult {
  const cycles = options.cycles ?? DEFAULT_CYCLES;
  const framesPerCycle = options.framesPerCycle ?? DEFAULT_FRAMES_PER_CYCLE;
  const seriesCount = options.seriesCount ?? 1;
  const midStreamGap = options.midStreamGap ?? 4000; // > 300 => sentinel path

  const validator = new FrameValidator();
  const store = new TelemetryDataStore(seriesCount);
  const prevValues: number[] = Array.from({ length: seriesCount }, () => NaN);

  const latencies: number[] = [];
  const syntheticPerReset: number[] = [];
  let totalReal = 0;
  let totalSynthetic = 0;

  const feed = (sequence: number, baseValue: number) => {
    const values = Array.from({ length: seriesCount }, (_, s) => baseValue + s);
    const buffer = encodeFrame(sequence, values);
    const frame = parseFrame(buffer, seriesCount);
    ingestFrame(validator, store, prevValues, frame);
  };

  for (let cycle = 0; cycle < cycles; cycle++) {
    // --- (Re)connect: server counter resets to 0 on every new connection ---
    const t0 = nowMs();
    validator.beginEpoch();
    for (let s = 0; s < prevValues.length; s++) prevValues[s] = NaN;

    const syntheticBeforeReset = store.syntheticPointCount();

    // First live frame after reconnect (counter starts at 0 again).
    feed(0, cycle * 10);
    const t1 = nowMs();
    latencies.push(t1 - t0);

    const syntheticAfterFirst = store.syntheticPointCount();
    syntheticPerReset.push(syntheticAfterFirst - syntheticBeforeReset);

    // Remainder of the cycle's nominal stream.
    for (let i = 1; i < framesPerCycle; i++) {
      feed(i, cycle * 10 + i);
    }

    // Inject a mid-stream large gap once per cycle to prove the cap holds.
    const seqBeforeGap = framesPerCycle - 1;
    feed(seqBeforeGap + midStreamGap, cycle * 10 + 1000);
  }

  totalReal = store.realPointCount();
  totalSynthetic = store.syntheticPointCount();

  const maxLatencyMs = latencies.reduce((m, x) => (x > m ? x : m), 0);
  const avgLatencyMs =
    latencies.reduce((a, b) => a + b, 0) / Math.max(latencies.length, 1);
  const maxSyntheticPerReset = syntheticPerReset.reduce(
    (m, x) => (x > m ? x : m),
    0
  );
  const passed = latencies.every((l) => l < TARGET_MS);

  return {
    cycles,
    maxLatencyMs,
    avgLatencyMs,
    maxSyntheticPerReset,
    totalRealPoints: totalReal,
    totalSyntheticPoints: totalSynthetic,
    passed,
    targetMs: TARGET_MS,
  };
}

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

/** Human-readable report; returns the underlying result. */
export function runBenchmark(
  options: ReconnectBenchmarkOptions = {}
): ReconnectBenchmarkResult {
  const result = simulateReconnectCycles(options);
  const lines = [
    "telemetry_chart_reconnect benchmark",
    "-----------------------------------",
    `cycles:                  ${result.cycles}`,
    `max live-data latency:   ${result.maxLatencyMs.toFixed(3)} ms`,
    `avg live-data latency:   ${result.avgLatencyMs.toFixed(3)} ms`,
    `max synthetic/reset:     ${result.maxSyntheticPerReset} (bug would insert thousands)`,
    `total real points:       ${result.totalRealPoints}`,
    `total synthetic points:  ${result.totalSyntheticPoints}`,
    `target:                  < ${result.targetMs} ms`,
    `result:                  ${result.passed ? "PASS" : "FAIL"}`,
  ];
  if (typeof process !== "undefined" && process.stdout) {
    process.stdout.write(lines.join("\n") + "\n");
  }
  return result;
}
