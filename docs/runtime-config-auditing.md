# Runtime Configuration Auditing and Drift Detection

## Architecture

Runtime configuration policy is defined in `src/services/runtimeConfigAudit.ts` as a small, deterministic ruleset. Each rule records the configuration key, expected value, service owner, severity, and human-readable remediation context. The same core logic powers UI visibility and API monitoring, so every service sees a consistent definition of drift.

## Critical path performance

The auditor compares one in-memory snapshot against the ruleset in a single pass. It performs no network or storage calls and records execution time on every audit result, keeping the critical path under the 100ms P99 budget.

## Monitoring and alerting

`GET /api/runtime-config/audit` returns JSON by default and Prometheus-style text when the `Accept` header includes `text/plain`. Critical drift returns HTTP 503 so existing uptime checks and canary analysis can fail closed. Exported metrics:

- `runtime_config_checked`
- `runtime_config_drifted`
- `runtime_config_critical`
- `runtime_config_audit_duration_ms`

## Blue-green and canary deployment

During blue-green releases, query `/api/runtime-config/audit` on both stacks before switching traffic. During canary analysis, block promotion when `runtime_config_critical` is greater than zero or when audit latency exceeds the 100ms target.

## Runbook

1. Open the Runtime Configuration panel on the dashboard and identify the drifted key.
2. Confirm the owning service and team from the audit response.
3. Compare the active environment value with the expected policy value.
4. Roll back the environment change or update the policy through security review.
5. Re-run `/api/runtime-config/audit` and verify `runtime_config_critical 0` before promotion.
