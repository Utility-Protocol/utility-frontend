# Chaos Engineering Testing Blueprint for Staging

## Objectives and bounds

This blueprint defines staged chaos experiments across the frontend, API gateway, telemetry stream, wallet adapter, and background workers. The staging chaos program must preserve these bounds:

- Critical-path performance: P99 latency stays below 100 ms.
- Availability: staging service availability remains at or above 99.99% during experiments.
- Security: every experiment requires security review before enablement and is aborted immediately for any confirmed security finding.
- Blast radius: each experiment starts at 1% canary traffic and must not exceed 10% of staging traffic until post-experiment review approves expansion.

## Architecture

1. Fault injection is applied through staging-only controls: edge latency rules, service mesh network policies, dependency route overrides, and worker resource limits.
2. Experiment definitions live in `src/utils/chaosBlueprint.ts` so tests can enforce the same safety gates documented here.
3. SLO monitors compare live telemetry against steady-state hypotheses before, during, and after each run.
4. An abort controller disables the active fault, shifts traffic to blue, and pages the staging incident lead when any abort condition is met.

## Experiment catalog

| Experiment | Services | Fault | Success hypothesis | Primary rollback |
| --- | --- | --- | --- | --- |
| Frontend critical-path latency injection | Frontend, API gateway | Inject edge latency on 5% of staging traffic | Critical journeys remain below 100 ms P99 | Disable edge fault and shift traffic back to blue |
| Telemetry stream network partition | Telemetry stream, background workers | Partition producers from consumers | Buffered telemetry drains after recovery while availability remains at 99.99% | Remove partition and scale consumers |
| Wallet adapter dependency outage | Wallet adapter, API gateway | Route wallet dependency calls to controlled failures | Wallet flows fail closed with recovery messaging and no credential leakage | Restore route, rotate staging secrets if exposed, invalidate sessions |

## Monitoring, alerting, and dashboards

Dashboards must include these panels before the first run:

- Web vitals and API gateway P99 latency with a 100 ms redline.
- Staging availability and synthetic journey success rate with a 99.99% redline.
- Error rate, queue depth, telemetry lag, worker replay success, wallet authentication failures, and session errors.
- Security scanner alerts and secret exposure findings.

Alerts page the staging incident lead when any abort condition in `STAGING_CHAOS_BLUEPRINT` is breached for its configured duration.

## Deployment and canary analysis

Use blue-green deployment for the chaos controls. Enable faults only on the green stack, then progress canary traffic through 1%, 5%, 25%, 50%, and 100% after each 15-minute analysis window passes. Roll back to blue immediately if latency, availability, error-rate, or security gates fail.

## Runbook

1. Confirm security approval, experiment owner, rollback owner, and incident lead.
2. Verify dashboards are live and baseline metrics have been stable for at least 30 minutes.
3. Deploy fault controls to green with the fault disabled.
4. Shift 1% of staging traffic to green and enable the selected fault.
5. Watch the analysis window; abort on any configured condition.
6. Progress canary only after SLOs, synthetic checks, and security signals remain healthy.
7. Disable the fault, return traffic to blue, and verify recovery metrics.
8. Document results, customer-impact simulation, remediation items, and the next safe blast radius.
