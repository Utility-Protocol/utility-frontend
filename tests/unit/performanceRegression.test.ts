import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PERFORMANCE_BUDGET,
  evaluateMetric,
  evaluatePerformanceRegression,
  renderRegressionSummary,
  type PerformanceMetrics,
} from '@/performance/regression';

const healthyMetric: PerformanceMetrics = {
  service: 'frontend',
  criticalPath: 'dashboard-render',
  p99LatencyMs: 82,
  availabilityPercent: 99.995,
  errorRatePercent: 0.005,
  sampleSize: 250,
  measuredAt: '2026-07-18T00:00:00.000Z',
};

describe('performance regression detection', () => {
  it('passes when all critical-path metrics meet the budget', () => {
    const report = evaluatePerformanceRegression([healthyMetric], DEFAULT_PERFORMANCE_BUDGET, healthyMetric.measuredAt);

    expect(report.passed).toBe(true);
    expect(report.violations).toEqual([]);
  });

  it('fails P99 latency at and above the 100ms target', () => {
    const violations = evaluateMetric({ ...healthyMetric, p99LatencyMs: 100 });

    expect(violations).toContainEqual(
      expect.objectContaining({ metric: 'p99LatencyMs', severity: 'critical', actual: 100 }),
    );
  });

  it('fails availability and error-rate regressions', () => {
    const report = evaluatePerformanceRegression([
      { ...healthyMetric, availabilityPercent: 99.98, errorRatePercent: 0.02 },
    ]);

    expect(report.passed).toBe(false);
    expect(report.violations.map((violation) => violation.metric)).toEqual(
      expect.arrayContaining(['availabilityPercent', 'errorRatePercent']),
    );
  });

  it('warns but does not fail for low sample counts without critical breaches', () => {
    const report = evaluatePerformanceRegression([{ ...healthyMetric, sampleSize: 12 }]);

    expect(report.passed).toBe(true);
    expect(report.violations).toEqual([
      expect.objectContaining({ metric: 'sampleSize', severity: 'warning' }),
    ]);
  });

  it('renders a CI-friendly summary', () => {
    const report = evaluatePerformanceRegression([{ ...healthyMetric, p99LatencyMs: 142 }], undefined, healthyMetric.measuredAt);

    expect(renderRegressionSummary(report)).toContain('Performance regression check: FAIL');
    expect(renderRegressionSummary(report)).toContain('P99 latency 142ms');
  });
});
