# Automated performance regression detection

## Architecture

The CI performance gate evaluates service-level critical-path metrics before a change can merge or deploy. Each pipeline run produces a `performance-metrics.json` payload, executes `npm run perf:check`, and uploads `performance-regression-report.json` for review. The gate enforces the product bounds from issue #110: P99 latency must stay below 100ms, availability must remain at or above 99.99%, and the derived or supplied error rate must stay at or below 0.01%.

## Metric contract

```json
{
  "budget": {
    "maxP99LatencyMs": 100,
    "minAvailabilityPercent": 99.99,
    "maxErrorRatePercent": 0.01,
    "minSampleSize": 50
  },
  "metrics": [
    {
      "service": "frontend",
      "criticalPath": "dashboard-render",
      "p99LatencyMs": 82,
      "availabilityPercent": 99.995,
      "errorRatePercent": 0.005,
      "sampleSize": 250,
      "measuredAt": "2026-07-18T00:00:00.000Z"
    }
  ]
}
```

## CI and deployment flow

1. Restore dependencies and the `.next/cache` build cache so measurements are not inflated by cold framework work.
2. Build and test the application.
3. Collect synthetic, load-test, or canary metrics for every critical path into `performance-metrics.json`.
4. Run `npm run perf:check -- performance-metrics.json performance-regression-report.json`.
5. Block the pipeline on critical breaches. Low sample counts are reported as warnings so teams can distinguish data-quality issues from confirmed regressions.
6. During blue-green or canary releases, run the same checker against canary traffic before increasing traffic weight.

## Monitoring, alerting, and dashboards

Dashboards should chart P50/P95/P99 latency, availability, error rate, request volume, and sample size by `service` and `criticalPath`. Alerts should page the owning service when P99 is at or above 100ms for two consecutive windows or availability drops below 99.99%. Warning notifications should route to the CI owner when sample size remains below 50 samples.

## Security review

The checker reads local JSON artifacts and writes a local report. Do not include secrets, tokens, user payloads, or raw request bodies in performance metrics. Security review should verify artifact retention, access controls, and that canary dashboards expose only aggregate telemetry.
