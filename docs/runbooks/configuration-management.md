# Configuration Management Runbook

## Symptoms

- `config.validation_failed` increases.
- Services report stale `config.version` values.
- Hot-reload latency P99 exceeds 100 ms.

## Triage

1. Check the configuration dashboard for the latest accepted version by service and environment.
2. Review validation-error logs. Sensitive fields must appear as `[REDACTED]`.
3. Confirm the publisher delivered the same payload to canary and control services.
4. If invalid payloads are recurring, pause the publisher and keep services on their last known-good snapshots.

## Remediation

- For schema mismatches, update the payload to satisfy the active schema and republish.
- For latency regressions, reduce payload size or increase the polling interval for non-critical services.
- For canary regressions, set `canaryPercent` to `0`, verify recovery, and restart the blue-green rollout after root cause is fixed.

## Security review checklist

- New fields have explicit types and validators.
- Secrets are marked `sensitive` and verified redacted in logs and dashboards.
- Config publishers authenticate and authorize updates out-of-band before payloads reach services.
