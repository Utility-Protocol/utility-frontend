/**
 * Performance regression detection core.
 *
 * Pure, framework-free logic used by the CI performance pipeline:
 *
 *  - `computePercentile` / `summarizeSamples` turn raw latency samples into
 *    P50/P95/P99 summaries.
 *  - `detectRegressions` compares current measurements against declarative
 *    budgets (`performance/budgets.json`) and the committed baseline
 *    (`performance/baseline.json`).
 *
 * Keeping the logic here (and unit-testing it) lets the Playwright benchmark
 * stay a thin measurement harness while every decision the gate makes is
 * deterministic and reviewed.
 */

export type PerformanceMetric = "p99" | "p95" | "mean";

export interface PerformanceBudget {
  id: string;
  name: string;
  path: string;
  metric: PerformanceMetric;
  /** Hard ceiling in milliseconds for the configured metric. */
  budgetMs: number;
  /** Max allowed % drift above the baseline before flagging a regression. */
  regressionTolerancePercent?: number;
  /** Minimum sample count required before a decision is made. */
  minSampleCount?: number;
}

export interface BaselineMeasurement {
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
  sampleCount: number;
  recordedAt: string;
}

export type PerformanceBaseline = Record<string, BaselineMeasurement>;

export interface PerformanceMeasurement {
  id: string;
  name: string;
  path: string;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  meanMs: number;
  sampleCount: number;
}

export type FindingStatus = "pass" | "budget-breach" | "regression" | "insufficient-data";

export interface Finding {
  id: string;
  name: string;
  path: string;
  status: FindingStatus;
  metric: PerformanceMetric;
  currentMs: number | null;
  budgetMs: number | null;
  baselineMs: number | null;
  deltaPercent: number | null;
  sampleCount: number;
  message: string;
}

export interface RegressionReport {
  generatedAt: string;
  findings: Finding[];
  passed: boolean;
}

export interface AnalyzeOptions {
  /** Override the tolerance used for every budget (percent, e.g. 20 => 20%). */
  defaultTolerancePercent?: number;
}

/** Nearest-rank percentile: returns the value at the given percentile (0-100). */
export function computePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.max(0, Math.ceil((percentile / 100) * sorted.length) - 1);
  return sorted[Math.min(rank, sorted.length - 1)];
}

/** Summarize a batch of latency samples into P50/P95/P99/mean. */
export function summarizeSamples(valuesMs: number[]): Omit<BaselineMeasurement, "recordedAt"> {
  if (valuesMs.length === 0) {
    return { p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0, sampleCount: 0 };
  }
  const sum = valuesMs.reduce((acc, v) => acc + v, 0);
  return {
    p50Ms: computePercentile(valuesMs, 50),
    p95Ms: computePercentile(valuesMs, 95),
    p99Ms: computePercentile(valuesMs, 99),
    meanMs: sum / valuesMs.length,
    sampleCount: valuesMs.length,
  };
}

/**
 * Evaluate one budget against the measured samples and the committed baseline.
 * Pure function — all inputs are explicit.
 */
export function evaluateBudget(
  budget: PerformanceBudget,
  samplesMs: number[],
  baseline: PerformanceBaseline | null,
  options: AnalyzeOptions = {}
): Finding {
  const summary = summarizeSamples(samplesMs);
  const minSampleCount = budget.minSampleCount ?? 1;

  if (summary.sampleCount < minSampleCount) {
    return {
      id: budget.id,
      name: budget.name,
      path: budget.path,
      status: "insufficient-data",
      metric: budget.metric,
      currentMs: null,
      budgetMs: budget.budgetMs,
      baselineMs: null,
      deltaPercent: null,
      sampleCount: summary.sampleCount,
      message: `Insufficient samples (${summary.sampleCount}/${minSampleCount}) to evaluate "${budget.name}".`,
    };
  }

  const currentMs = summary[metricField(budget.metric)];
  const baselineEntry = baseline?.[budget.id];
  const baselineMs = baselineEntry ? baselineEntry[metricField(budget.metric)] : null;

  // Hard budget breach always fails, regardless of the baseline.
  if (currentMs > budget.budgetMs) {
    return {
      id: budget.id,
      name: budget.name,
      path: budget.path,
      status: "budget-breach",
      metric: budget.metric,
      currentMs,
      budgetMs: budget.budgetMs,
      baselineMs,
      deltaPercent: percentDelta(currentMs, baselineMs),
      sampleCount: summary.sampleCount,
      message: `"${budget.name}" ${budget.metric.toUpperCase()} ${formatMs(currentMs)} exceeds the ${formatMs(budget.budgetMs)} budget.`,
    };
  }

  // Relative regression check against the committed baseline.
  if (baselineMs !== null && baselineMs > 0) {
    const tolerancePercent = budget.regressionTolerancePercent ?? options.defaultTolerancePercent ?? 20;
    const delta = percentDelta(currentMs, baselineMs) ?? 0;
    if (delta > tolerancePercent) {
      return {
        id: budget.id,
        name: budget.name,
        path: budget.path,
        status: "regression",
        metric: budget.metric,
        currentMs,
        budgetMs: budget.budgetMs,
        baselineMs,
        deltaPercent: delta,
        sampleCount: summary.sampleCount,
        message: `"${budget.name}" ${budget.metric.toUpperCase()} ${formatMs(currentMs)} is ${formatPercent(delta)} above the baseline ${formatMs(baselineMs)}.`,
      };
    }
  }

  return {
    id: budget.id,
    name: budget.name,
    path: budget.path,
    status: "pass",
    metric: budget.metric,
    currentMs,
    budgetMs: budget.budgetMs,
    baselineMs,
    deltaPercent: percentDelta(currentMs, baselineMs),
    sampleCount: summary.sampleCount,
    message: `"${budget.name}" ${budget.metric.toUpperCase()} ${formatMs(currentMs)} is within budget and baseline tolerance.`,
  };
}

/**
 * Evaluate all budgets against a raw samples map keyed by budget id.
 * Returns a report that the CI gate can fail on.
 */
export function detectRegressions(
  budgets: PerformanceBudget[],
  samplesByBudgetId: Record<string, number[]>,
  baseline: PerformanceBaseline | null,
  options: AnalyzeOptions = {}
): RegressionReport {
  const findings = budgets.map((budget) =>
    evaluateBudget(budget, samplesByBudgetId[budget.id] ?? [], baseline, options)
  );

  return {
    generatedAt: new Date().toISOString(),
    findings,
    passed: findings.every(
      (finding) => finding.status === "pass" || finding.status === "insufficient-data"
    ),
  };
}

/** Convert a raw samples map into full measurement summaries (for reports). */
export function summarizeAll(
  budgets: PerformanceBudget[],
  samplesByBudgetId: Record<string, number[]>
): PerformanceMeasurement[] {
  return budgets.map((budget) => {
    const summary = summarizeSamples(samplesByBudgetId[budget.id] ?? []);
    return {
      id: budget.id,
      name: budget.name,
      path: budget.path,
      ...summary,
    };
  });
}

/** Map a budget metric to the summary/baseline field that stores it. */
function metricField(metric: PerformanceMetric): "p95Ms" | "p99Ms" | "meanMs" {
  switch (metric) {
    case "p95":
      return "p95Ms";
    case "p99":
      return "p99Ms";
    case "mean":
      return "meanMs";
  }
}

function percentDelta(currentMs: number, baselineMs: number | null): number | null {
  if (baselineMs === null || baselineMs <= 0) return null;
  return ((currentMs - baselineMs) / baselineMs) * 100;
}

function formatMs(ms: number): string {
  return `${ms.toFixed(1)}ms`;
}

function formatPercent(pct: number): string {
  return `${pct.toFixed(1)}%`;
}
