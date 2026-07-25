# Service Level Objective Monitoring and Burn Rate Alerts

## Objectives

- Track system-wide 99.99% availability across critical services.
- Keep critical-path P99 latency below 100ms.
- Surface fast burn-rate signals before the full error budget is exhausted.
- Support blue-green releases and canary analysis by comparing SLO compliance before promotion.

## Architecture

1. Instrument each service with request outcome counters and P99 latency histograms.
2. Normalize measurements into shared SLO windows (`5m`, `30m`, `1h`, `6h`, and `24h`).
3. Evaluate burn rates with `evaluateBurnRateAlerts` in `src/utils/slo.ts`.
4. Render dashboard state in `SloMonitoringPanel` for operators.
5. Route page-level alerts for rapid burns, tickets for sustained burns, and watch alerts for slow burns or latency regressions.

## Alert thresholds

| Severity | Windows | Burn rate |
| --- | --- | --- |
| Page | 5m + 1h | 14.4x |
| Ticket | 30m + 6h | 6x |
| Watch | 1h + 24h | 3x |

## Runbook

1. Confirm the impacted objective and whether the trigger is availability, latency, or both.
2. Compare the active blue and green environments; pause promotion if green burns faster than blue.
3. Inspect recent deployments, network dependencies, and telemetry ingestion health.
4. Roll back or shift traffic when page-level burn persists for two consecutive evaluations.
5. Document remediation and update the associated canary analysis notes.
