# Automated Performance Regression Detection in CI

## Problem statement

Performance regressions can silently slip into the frontend: a heavier bundle,
a slower API handler, or an expensive render path degrades the P99 latency of
critical paths without breaking any functional test. This document describes
the automated performance regression detection pipeline that runs in CI to
catch those regressions before they reach production.

## Goals and technical bounds

- **Performance target:** critical paths must stay below **100ms P99**.
- **Availability target:** 99.99% uptime — performance gates run on every pull
  request so regressions never merge.
- **Scope:** system-wide; the same measurement + baseline + budget mechanism is
  used by the PR gate, the canary analysis, and the SLO monitoring burn-rate
  alerts (`docs/slo-monitoring.md`).
- **Security:** the pipeline only measures HTTP endpoints and browser metrics
  exposed by the application. No secrets are used; the baseline is a committed,
  reviewable JSON file.

## Architecture

```
                    Pull request / main push
                              │
                              ▼
              ┌─────────────────────────────┐
              │  performance-regression.yml │  (GitHub Actions)
              └─────────────────────────────┘
                              │
          build app · start server · run benchmarks
                              │
                              ▼
        ┌─────────────────────────────────────────────┐
        │  Playwright benchmark (tests/performance)   │
        │  measures critical paths: API latency, TTFB │
        └─────────────────────────────────────────────┘
                              │  writes raw samples
                              ▼
        ┌─────────────────────────────────────────────┐
        │  scripts/analyze-performance.ts             │
        │  summarize → compare vs budgets + baseline  │
        └─────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
   report.json          report.html            PR comment
   (machine-           (dashboard for         (human-readable
    readable)           operators)             findings table)
        │
        ▼
   Gate: exit 1 when a budget is breached or a regression
   exceeds the baseline tolerance → PR is blocked.
```

### Components

| Component | Location | Responsibility |
| --- | --- | --- |
| Budgets | `performance/budgets.json` | Declarative critical-path definitions with P99 budgets and regression tolerance. |
| Baseline | `performance/baseline.json` | Committed, reviewable reference measurements refreshed on `main`. |
| Core logic | `src/utils/performanceRegression.ts` | Pure percentile/summary/regression-detection functions with unit tests. |
| Benchmark | `tests/performance/performance.spec.ts` | Playwright tests that capture raw latency samples. |
| Analyzer | `scripts/analyze-performance.ts` | Summarizes samples, evaluates budgets + baseline, writes reports, sets the gate. |
| Baseline updater | `scripts/update-performance-baseline.ts` | Copies the latest measurements into the committed baseline. |
| CI workflow | `.github/workflows/performance-regression.yml` | Builds, measures, analyzes, comments on the PR, blocks on regressions. |

## Critical paths and budgets

The budgets file declares every critical path that is measured. Each entry
carries:

- `id` and `name` — stable identifier and human-readable label.
- `metric` — the summary metric compared against the budget (`p99`, `p95`, or
  `mean`). Critical paths use `p99` by default.
- `budgetMs` — the hard ceiling (e.g. `100` for API critical paths, per the
  100ms P99 target).
- `regressionTolerancePercent` — how far the current measurement may drift
  above the committed baseline before it is flagged as a regression (guards
  against CI runner noise).
- `minSampleCount` — minimum number of samples required to make a decision;
  below this the finding is `insufficient-data` and does not fail the gate.

Current critical paths:

| id | Path | Metric | Budget |
| --- | --- | --- | ---: |
| `api-runtime-config-audit` | `/api/runtime-config/audit` | P99 | 100ms |
| `api-rate-limit` | `/api/rate-limit` | P99 | 100ms |
| `page-home-ttfb` | `/` | P99 | 1000ms |
| `page-export-ttfb` | `/export` | P99 | 1000ms |
| `page-home-lcp` | `/` | P99 | 2500ms |
| `page-export-lcp` | `/export` | P99 | 2500ms |

## Regression detection rules

For each budget, the analyzer computes percentiles from the raw samples
(`p50`, `p95`, `p99`, `mean`) and classifies the finding:

| Status | Condition | Gate |
| --- | --- | --- |
| `pass` | Measurement within budget and within baseline tolerance | ✅ |
| `budget-breach` | `current > budgetMs` | ❌ blocks PR |
| `regression` | `current > baseline × (1 + tolerance)` while still under budget | ❌ blocks PR |
| `insufficient-data` | Fewer than `minSampleCount` samples collected | ⚠️ does not block |

Regressions are relative to the committed baseline so meaningful slowdowns are
caught, while tolerance absorbs CI-runner variance. Hard budget breaches always
fail regardless of the baseline.

## Monitoring, alerting, and dashboards

1. **PR status check** — `Performance Regression / performance` is the alert:
   a regression or budget breach marks the check red and blocks the merge.
2. **PR comment** — the workflow posts a markdown table of findings to the PR
   (`performance-results/performance-comment.md`), so reviewers see exactly
   which critical path regressed and by how much.
3. **HTML dashboard** — `performance-results/report.html` is uploaded as a
   workflow artifact for the run-level breakdown.
4. **Machine-readable report** — `performance-results/report.json` is consumed
   by tooling and can be folded into the SLO monitoring panel
   (`src/utils/slo.ts`), which already targets `< 100ms` P99 for critical
   paths.

## Blue-green deployment and canary analysis

The same baseline mechanism supports the blue-green rollout described in
`docs/TRACING_DEPLOYMENT.md`:

1. The **green (candidate)** environment runs the identical benchmark suite.
2. `scripts/analyze-performance.ts` compares the green measurements against the
   committed baseline (which reflects the current **blue** environment).
3. Promotion proceeds only when the canary is within the budget and the
   baseline tolerance — mirroring the "Critical Path Latency P99 < 100ms"
   canary threshold in the tracing deployment runbook.
4. If the canary regresses, the load balancer stays on blue and the incident
   runbook (`docs/runbooks/performance-regression.md`) applies.

## Baseline lifecycle

- `performance/baseline.json` is committed and reviewed like any other source
  file.
- On every push to `main`, the workflow re-measures the critical paths and
  refreshes the baseline so it tracks the actual runner environment.
- The baseline can also be refreshed manually:

  ```bash
  npm run test:performance        # measure critical paths locally
  npm run performance:update-baseline
  ```

## Runbook

See `docs/runbooks/performance-regression.md` for triage, remediation, and how
to update budgets.
