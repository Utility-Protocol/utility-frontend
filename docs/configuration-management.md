# Configuration Management Architecture

## Goals

- Validate every system-wide configuration update against a typed schema before it reaches application code.
- Hot-reload accepted changes without a page reload or service restart.
- Keep critical-path reads under the 100 ms P99 target by serving values from an in-memory snapshot.
- Support 99.99% availability by rejecting bad payloads and retaining the last known-good configuration.

## Design

`ConfigManager` owns a versioned, immutable snapshot. Writers call `apply()` with partial updates. The manager merges the update over the active snapshot, adds schema defaults, validates the candidate, and atomically swaps it only when validation succeeds.

Consumers read with `get()` or subscribe to hot-reload events. Subscribers receive the previous snapshot, current snapshot, changed keys, version, and apply timestamp. Polling sources can be connected through `createPoller()`, which is intentionally transport-agnostic so services can use REST, SSE, WebSocket, or edge-config providers.

## Schema validation and security

Each schema field declares a primitive type, optional default, required flag, custom validator, description, and sensitive flag. Sensitive values are redacted before logs, dashboards, or alert payloads are emitted.

Rejected updates increment `config.validation_failed`, call the validation-error hook, and leave the active snapshot untouched. This protects uptime during bad deploys or compromised config pushes.

## Monitoring and alerting

Emit these metrics from the manager hooks:

- `config.reload_latency_ms` with `result=success`; alert when P99 exceeds 100 ms for 5 minutes.
- `config.validation_failed`; page on repeated failures from the same environment.
- `config.version`; dashboard the latest accepted version per service.
- Subscriber handler errors should be captured by the service-level error boundary or telemetry pipeline.

## Deployment

1. Deploy schema-only support dark-launched with the current static configuration as the initial snapshot.
2. Enable polling for an internal canary cohort by setting `canaryPercent` above 0.
3. Compare config reload latency, validation failure rate, and user-facing error rate between canary and control.
4. Roll forward blue-green once canary metrics remain healthy for the agreed analysis window.
5. Roll back by stopping the external config publisher; services keep the last known-good snapshot.
