#!/usr/bin/env -S npx tsx

/**
 * Performance baseline update script.
 *
 * Reads the latest raw samples from `performance-results/samples.json`,
 * summarizes them, and writes the result into the committed baseline
 * (`performance/baseline.json`).
 *
 * The baseline is refreshed automatically by the performance-regression
 * workflow on pushes to `main` so the PR gate compares against the most
 * recent known-good measurements. It can also be run manually:
 *
 *   npm run test:performance
 *   npm run performance:update-baseline
 */

import fs from "node:fs";
import path from "node:path";
import { summarizeAll, type PerformanceBaseline, type PerformanceBudget } from "@/utils/performanceRegression";

const RESULTS_DIR = path.resolve(process.cwd(), "performance-results");
const SAMPLES_FILE = path.join(RESULTS_DIR, "samples.json");
const BUDGETS_FILE = path.resolve(process.cwd(), "performance", "budgets.json");
const BASELINE_FILE = path.resolve(process.cwd(), "performance", "baseline.json");

interface SamplesFile {
  samples: Record<string, number[]>;
}

function main(): void {
  if (!fs.existsSync(SAMPLES_FILE)) {
    console.error(
      `✗ Samples file not found: ${SAMPLES_FILE}\n` +
        `  Run \`npm run test:performance\` first to generate measurements.`
    );
    process.exit(1);
  }

  const budgets = JSON.parse(fs.readFileSync(BUDGETS_FILE, "utf8")) as { budgets: PerformanceBudget[] };
  const { samples } = JSON.parse(fs.readFileSync(SAMPLES_FILE, "utf8")) as SamplesFile;

  const measurements = summarizeAll(budgets.budgets, samples);

  const baseline: PerformanceBaseline = {};
  const now = new Date().toISOString();
  for (const m of measurements) {
    if (m.sampleCount === 0) continue;
    baseline[m.id] = {
      p50Ms: m.p50Ms,
      p95Ms: m.p95Ms,
      p99Ms: m.p99Ms,
      meanMs: m.meanMs,
      sampleCount: m.sampleCount,
      recordedAt: now,
    };
  }

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2) + "\n");
  // eslint-disable-next-line no-console
  console.log(`✓ Performance baseline updated: ${Object.keys(baseline).length} measurement(s) written to ${BASELINE_FILE}`);
}

main();
