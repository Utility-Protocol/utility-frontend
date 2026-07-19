export type MetricName = 'p99LatencyMs' | 'availabilityPercent' | 'errorRatePercent';

export interface PerformanceMetrics {
  service: string;
  criticalPath: string;
  p99LatencyMs: number;
  availabilityPercent: number;
  errorRatePercent?: number;
  sampleSize: number;
  measuredAt: string;
}

export interface PerformanceBudget {
  maxP99LatencyMs: number;
  minAvailabilityPercent: number;
  maxErrorRatePercent: number;
  minSampleSize: number;
}

export interface RegressionViolation {
  service: string;
  criticalPath: string;
  metric: MetricName | 'sampleSize';
  actual: number;
  expected: number;
  severity: 'warning' | 'critical';
  message: string;
}

export interface RegressionReport {
  passed: boolean;
  evaluatedAt: string;
  budget: PerformanceBudget;
  metrics: PerformanceMetrics[];
  violations: RegressionViolation[];
}

export const DEFAULT_PERFORMANCE_BUDGET: PerformanceBudget = {
  maxP99LatencyMs: 100,
  minAvailabilityPercent: 99.99,
  maxErrorRatePercent: 0.01,
  minSampleSize: 50,
};

export function evaluatePerformanceRegression(
  metrics: PerformanceMetrics[],
  budget: PerformanceBudget = DEFAULT_PERFORMANCE_BUDGET,
  evaluatedAt = new Date().toISOString(),
): RegressionReport {
  const violations = metrics.flatMap((metric) => evaluateMetric(metric, budget));

  return {
    passed: violations.every((violation) => violation.severity !== 'critical'),
    evaluatedAt,
    budget,
    metrics,
    violations,
  };
}

export function evaluateMetric(
  metric: PerformanceMetrics,
  budget: PerformanceBudget = DEFAULT_PERFORMANCE_BUDGET,
): RegressionViolation[] {
  const violations: RegressionViolation[] = [];
  const context = `${metric.service}/${metric.criticalPath}`;

  if (metric.sampleSize < budget.minSampleSize) {
    violations.push({
      service: metric.service,
      criticalPath: metric.criticalPath,
      metric: 'sampleSize',
      actual: metric.sampleSize,
      expected: budget.minSampleSize,
      severity: 'warning',
      message: `${context} only had ${metric.sampleSize} samples; collect at least ${budget.minSampleSize} before gating deployment.`,
    });
  }

  if (metric.p99LatencyMs >= budget.maxP99LatencyMs) {
    violations.push({
      service: metric.service,
      criticalPath: metric.criticalPath,
      metric: 'p99LatencyMs',
      actual: metric.p99LatencyMs,
      expected: budget.maxP99LatencyMs,
      severity: 'critical',
      message: `${context} P99 latency ${metric.p99LatencyMs}ms breaches the < ${budget.maxP99LatencyMs}ms target.`,
    });
  }

  if (metric.availabilityPercent < budget.minAvailabilityPercent) {
    violations.push({
      service: metric.service,
      criticalPath: metric.criticalPath,
      metric: 'availabilityPercent',
      actual: metric.availabilityPercent,
      expected: budget.minAvailabilityPercent,
      severity: 'critical',
      message: `${context} availability ${metric.availabilityPercent}% is below ${budget.minAvailabilityPercent}%.`,
    });
  }

  const errorRatePercent = metric.errorRatePercent ?? Math.max(0, 100 - metric.availabilityPercent);
  if (errorRatePercent > budget.maxErrorRatePercent) {
    violations.push({
      service: metric.service,
      criticalPath: metric.criticalPath,
      metric: 'errorRatePercent',
      actual: errorRatePercent,
      expected: budget.maxErrorRatePercent,
      severity: 'critical',
      message: `${context} error rate ${errorRatePercent}% exceeds ${budget.maxErrorRatePercent}%.`,
    });
  }

  return violations;
}

export function renderRegressionSummary(report: RegressionReport): string {
  const status = report.passed ? 'PASS' : 'FAIL';
  const lines = [
    `Performance regression check: ${status}`,
    `Evaluated ${report.metrics.length} critical path(s) at ${report.evaluatedAt}`,
    `Budget: P99 < ${report.budget.maxP99LatencyMs}ms, availability >= ${report.budget.minAvailabilityPercent}%, error rate <= ${report.budget.maxErrorRatePercent}%`,
  ];

  if (report.violations.length === 0) {
    return [...lines, 'No budget violations detected.'].join('\n');
  }

  return [
    ...lines,
    'Violations:',
    ...report.violations.map(
      (violation) => `- [${violation.severity.toUpperCase()}] ${violation.message}`,
    ),
  ].join('\n');
}
