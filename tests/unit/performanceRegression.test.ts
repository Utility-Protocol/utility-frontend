import { describe, expect, it } from "vitest";
import {
  computePercentile,
  detectRegressions,
  evaluateBudget,
  summarizeAll,
  summarizeSamples,
  type PerformanceBaseline,
  type PerformanceBudget,
} from "@/utils/performanceRegression";

const BUDGET: PerformanceBudget = {
  id: "api-runtime-config-audit",
  name: "Runtime Config Audit API",
  path: "/api/runtime-config/audit",
  metric: "p99",
  budgetMs: 100,
  regressionTolerancePercent: 20,
  minSampleCount: 5,
};

describe("computePercentile", () => {
  it("computes nearest-rank percentiles", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(computePercentile(values, 50)).toBe(5);
    expect(computePercentile(values, 90)).toBe(9);
    expect(computePercentile(values, 100)).toBe(10);
    expect(computePercentile(values, 0)).toBe(1);
  });

  it("handles unsorted input", () => {
    expect(computePercentile([10, 1, 9, 2, 8, 3, 7, 4, 6, 5], 50)).toBe(5);
  });

  it("handles single element and empty input", () => {
    expect(computePercentile([42], 99)).toBe(42);
    expect(computePercentile([], 99)).toBe(0);
  });

  it("does not mutate the input array", () => {
    const values = [3, 1, 2];
    computePercentile(values, 50);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("summarizeSamples", () => {
  it("computes P50/P95/P99/mean with counts", () => {
    // Nearest-rank percentiles: p95 of 10 values is the 10th (rank 9), p99 is also the max.
    const summary = summarizeSamples([10, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
    expect(summary.p50Ms).toBe(50);
    expect(summary.p95Ms).toBe(100);
    expect(summary.p99Ms).toBe(100);
    expect(summary.meanMs).toBe(55);
    expect(summary.sampleCount).toBe(10);
  });

  it("returns zeros for empty input", () => {
    expect(summarizeSamples([])).toEqual({ p50Ms: 0, p95Ms: 0, p99Ms: 0, meanMs: 0, sampleCount: 0 });
  });
});

describe("evaluateBudget", () => {
  it("passes when within budget and baseline tolerance", () => {
    const baseline: PerformanceBaseline = {
      [BUDGET.id]: { p50Ms: 40, p95Ms: 70, p99Ms: 80, meanMs: 45, sampleCount: 20, recordedAt: "" },
    };
    const finding = evaluateBudget(BUDGET, [40, 45, 50, 55, 60, 65], baseline);
    expect(finding.status).toBe("pass");
    expect(finding.currentMs).toBe(65); // p99 (nearest rank) of the sample set
  });

  it("flags a budget breach when current exceeds the hard budget", () => {
    const finding = evaluateBudget(BUDGET, [110, 120, 130, 140, 150], null);
    expect(finding.status).toBe("budget-breach");
    expect(finding.currentMs).toBe(150);
    expect(finding.message).toContain("exceeds");
  });

  it("flags a regression when current drifts above the baseline tolerance", () => {
    const baseline: PerformanceBaseline = {
      [BUDGET.id]: { p50Ms: 30, p95Ms: 45, p99Ms: 50, meanMs: 32, sampleCount: 20, recordedAt: "" },
    };
    // p99 = 82ms, 64% above the 50ms baseline > 20% tolerance, but under the 100ms budget.
    const finding = evaluateBudget(BUDGET, [70, 75, 78, 80, 82], baseline);
    expect(finding.status).toBe("regression");
    expect(finding.deltaPercent).toBeCloseTo(64, 5);
    expect(finding.message).toContain("above the baseline");
  });

  it("passes when drift is within tolerance", () => {
    const baseline: PerformanceBaseline = {
      [BUDGET.id]: { p50Ms: 30, p95Ms: 45, p99Ms: 50, meanMs: 32, sampleCount: 20, recordedAt: "" },
    };
    // p99 = 55ms, 10% above baseline < 20% tolerance.
    const finding = evaluateBudget(BUDGET, [50, 52, 53, 54, 55], baseline);
    expect(finding.status).toBe("pass");
  });

  it("treats a missing baseline as pass (no comparison possible)", () => {
    const finding = evaluateBudget(BUDGET, [40, 45, 50, 55, 60], null);
    expect(finding.status).toBe("pass");
    expect(finding.baselineMs).toBeNull();
    expect(finding.deltaPercent).toBeNull();
  });

  it("reports insufficient data below minSampleCount without failing", () => {
    const finding = evaluateBudget(BUDGET, [45, 50], null);
    expect(finding.status).toBe("insufficient-data");
    expect(finding.sampleCount).toBe(2);
  });

  it("supports p95 and mean metrics via the budget", () => {
    const p95Budget: PerformanceBudget = { ...BUDGET, metric: "p95", budgetMs: 80 };
    const p95 = evaluateBudget(p95Budget, [70, 75, 80, 85, 90], null);
    expect(p95.status).toBe("budget-breach");
    expect(p95.currentMs).toBe(90); // p95 (nearest rank) of 5 values is the max

    const meanBudget: PerformanceBudget = { ...BUDGET, metric: "mean", budgetMs: 50 };
    const mean = evaluateBudget(meanBudget, [60, 60, 60, 60, 60], null);
    expect(mean.status).toBe("budget-breach");
    expect(mean.currentMs).toBe(60);
  });

  it("respects the default tolerance option when the budget has no tolerance", () => {
    const baseline: PerformanceBaseline = {
      [BUDGET.id]: { p50Ms: 30, p95Ms: 45, p99Ms: 50, meanMs: 32, sampleCount: 20, recordedAt: "" },
    };
    // Budget without an explicit tolerance; 10% drift fails under defaultTolerancePercent: 5.
    const noToleranceBudget: PerformanceBudget = { ...BUDGET, regressionTolerancePercent: undefined };
    const finding = evaluateBudget(noToleranceBudget, [50, 52, 53, 54, 55], baseline, { defaultTolerancePercent: 5 });
    expect(finding.status).toBe("regression");
  });

  it("budget-level tolerance wins over the default option", () => {
    const baseline: PerformanceBaseline = {
      [BUDGET.id]: { p50Ms: 30, p95Ms: 45, p99Ms: 50, meanMs: 32, sampleCount: 20, recordedAt: "" },
    };
    // Budget tolerance is 20%; a 10% drift passes even with a 5% default.
    const finding = evaluateBudget(BUDGET, [50, 52, 53, 54, 55], baseline, { defaultTolerancePercent: 5 });
    expect(finding.status).toBe("pass");
  });
});

describe("detectRegressions", () => {
  it("returns a passing report when everything is healthy", () => {
    const report = detectRegressions([BUDGET], { [BUDGET.id]: [40, 45, 50, 55, 60, 65] }, null);
    expect(report.passed).toBe(true);
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].status).toBe("pass");
  });

  it("fails the report on a budget breach", () => {
    const report = detectRegressions([BUDGET], { [BUDGET.id]: [110, 120, 130, 140, 150] }, null);
    expect(report.passed).toBe(false);
    expect(report.findings[0].status).toBe("budget-breach");
  });

  it("fails the report on a regression beyond baseline tolerance", () => {
    const baseline: PerformanceBaseline = {
      [BUDGET.id]: { p50Ms: 30, p95Ms: 45, p99Ms: 50, meanMs: 32, sampleCount: 20, recordedAt: "" },
    };
    const report = detectRegressions([BUDGET], { [BUDGET.id]: [70, 75, 78, 80, 82] }, baseline);
    expect(report.passed).toBe(false);
    expect(report.findings[0].status).toBe("regression");
  });

  it("does not fail on insufficient data", () => {
    const report = detectRegressions([BUDGET], { [BUDGET.id]: [50, 55] }, null);
    expect(report.passed).toBe(true);
    expect(report.findings[0].status).toBe("insufficient-data");
  });

  it("handles multiple budgets independently", () => {
    const second: PerformanceBudget = { ...BUDGET, id: "api-rate-limit", name: "Rate Limit API", path: "/api/rate-limit" };
    const report = detectRegressions(
      [BUDGET, second],
      { [BUDGET.id]: [40, 45, 50, 55, 60], [second.id]: [120, 125, 130, 135, 140] },
      null
    );
    expect(report.passed).toBe(false);
    const statuses = report.findings.map((f) => f.status);
    expect(statuses).toContain("pass");
    expect(statuses).toContain("budget-breach");
  });

  it("treats missing sample entries as insufficient data", () => {
    const report = detectRegressions([BUDGET], {}, null);
    expect(report.findings[0].status).toBe("insufficient-data");
    expect(report.findings[0].sampleCount).toBe(0);
  });

  it("generates an ISO timestamp in the report", () => {
    const report = detectRegressions([BUDGET], { [BUDGET.id]: [40, 45, 50, 55, 60] }, null);
    expect(Number.isNaN(Date.parse(report.generatedAt))).toBe(false);
  });
});

describe("summarizeAll", () => {
  it("produces measurements for every budget", () => {
    const measurements = summarizeAll([BUDGET], { [BUDGET.id]: [10, 20, 30, 40, 50] });
    expect(measurements).toHaveLength(1);
    expect(measurements[0]).toMatchObject({
      id: BUDGET.id,
      name: BUDGET.name,
      path: BUDGET.path,
      p50Ms: 30,
      sampleCount: 5,
    });
  });

  it("produces zeroed measurements when samples are missing", () => {
    const measurements = summarizeAll([BUDGET], {});
    expect(measurements[0].sampleCount).toBe(0);
    expect(measurements[0].p99Ms).toBe(0);
  });
});
