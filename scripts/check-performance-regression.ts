#!/usr/bin/env tsx
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  DEFAULT_PERFORMANCE_BUDGET,
  evaluatePerformanceRegression,
  renderRegressionSummary,
  type PerformanceBudget,
  type PerformanceMetrics,
} from '../src/performance/regression';

interface InputPayload {
  budget?: Partial<PerformanceBudget>;
  metrics: PerformanceMetrics[];
}

const inputPath = process.argv[2] ?? 'performance-metrics.json';
const outputPath = process.argv[3] ?? 'performance-regression-report.json';

const payload = JSON.parse(readFileSync(inputPath, 'utf8')) as InputPayload;
const budget = { ...DEFAULT_PERFORMANCE_BUDGET, ...payload.budget };
const report = evaluatePerformanceRegression(payload.metrics, budget);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, JSON.stringify(report, null, 2));
console.warn(renderRegressionSummary(report));

if (!report.passed) {
  process.exitCode = 1;
}
