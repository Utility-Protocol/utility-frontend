# Runbook: Performance Regression Gate

The `Performance Regression` workflow measures critical-path latency on every
pull request and blocks the merge when a budget is breached or a regression
exceeds the baseline tolerance. This runbook covers triage, remediation, and
maintenance.

Architecture and design: [docs/performance-regression-detection.md](../performance-regression-detection.md).

## What the gate does

1. Builds the application and starts the production server.
2. Runs the Playwright benchmark (`tests/performance/performance.spec.ts`),
   which samples:
   - API round-trip latency for `/api/runtime-config/audit` and
     `/api/rate-limit` (P99 budget: **100ms**).
   - TTFB and LCP for `/` and `/export`.
3. `scripts/analyze-performance.ts` summarizes the samples and compares them
   against `performance/budgets.json` and `performance/baseline.json`.
4. Findings are posted as a PR comment and uploaded as artifacts
   (`performance-report`), and the check fails when anything is not green.

## Reading the report

Every finding has a status:

| Status | Meaning | Blocks merge? |
| --- | --- | --- |
| `pass` | Within budget and baseline tolerance | No |
| `budget-breach` | Hard budget exceeded (e.g. P99 > 100ms) | **Yes** |
| `regression` | Slower than the committed baseline by > tolerance | **Yes** |
| `insufficient-data` | Fewer than `minSampleCount` samples | No |

Look at the **Δ vs Baseline** column first: a large positive delta means the
PR introduced a slowdown on that critical path. A `budget-breach` means the
path is over the absolute SLO target regardless of history.

## Triage

1. Open the `performance-report` artifact from the failed run and open
   `report.html` (dashboard) or `report.json` (machine-readable).
2. Identify the failing budget id and metric.
3. Compare the current value against the budget and baseline.

### Common causes

- **Bundle bloat:** a new dependency or heavier import in a critical route.
- **API handler slowdown:** new work in an API route (I/O, crypto, parsing).
- **Render path regression:** heavier client components affecting LCP.
- **Baseline drift:** CI runner noise or a stale baseline. If the same code
  re-runs green on a retry, the failure was noise.

## Remediation

1. Optimize the affected path (code-split the component, cache the API
   response, move work off the critical path).
2. Re-run the benchmark locally to confirm the improvement:

   ```bash
   npm run test:performance
   npm run performance:analyze
   ```

3. Push and confirm the check is green.

## Updating budgets or tolerances

Budgets are declared in `performance/budgets.json`:

```json
{
  "id": "api-runtime-config-audit",
  "name": "Runtime Config Audit API",
  "path": "/api/runtime-config/audit",
  "metric": "p99",
  "budgetMs": 100,
  "regressionTolerancePercent": 20,
  "minSampleCount": 5
}
```

- `budgetMs` is the hard SLO ceiling. Do **not** raise it for the 100ms
  critical-path target without an explicit exception.
- `regressionTolerancePercent` absorbs runner noise; raise it only when
  measuring on a new, noisier environment.
- `minSampleCount` guards the gate against too few samples to be meaningful.

## Refreshing the baseline

The baseline refreshes automatically on pushes to `main` (and the weekly
schedule) when the run is green. To refresh manually:

```bash
npm run test:performance
npm run performance:update-baseline
```

Commit the updated `performance/baseline.json` in a reviewable PR.

## Escalation

If a critical path exceeds its budget in production, apply the SLO incident
runbook ([docs/slo-monitoring.md](../slo-monitoring.md)) and the blue-green
rollback procedure in [docs/TRACING_DEPLOYMENT.md](../TRACING_DEPLOYMENT.md):
keep the load balancer on blue, investigate the canary measurements, and only
promote when the canary is within budget and baseline tolerance.
