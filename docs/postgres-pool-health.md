# PostgreSQL Connection Pool Health Probe with Adaptive Sizing

## Architecture

The health probe samples each service pool for active, idle, waiting, maximum connection count, probe latency, and probe error count. The shared policy in `src/services/postgresPoolHealth.ts` converts those snapshots into a service-wide status, alert severity, Prometheus-style metric names, and an adaptive max-connection recommendation.

## Adaptive sizing policy

- Keep critical-path probe latency below 100 ms P99.
- Scale up by four connections when utilization reaches 70% or clients are waiting.
- Scale down by two connections only when utilization is below 31.5%, no clients are waiting, and the cooldown has elapsed.
- Clamp all recommendations between 4 and 80 connections to protect PostgreSQL from runaway clients.
- Enforce a 30 second resize cooldown to prevent oscillation during short spikes.

## Monitoring and alerting

Emit the `metrics` map from every assessment to the metrics pipeline. Page on `critical`, warn on `degraded`, and annotate dashboard panels with the `reasons` list for operators.

## Deployment runbook

1. Deploy the probe in blue-green mode with recommendations logged but not applied.
2. Canary one low-traffic service with adaptive resizing enabled.
3. Compare P99 latency, waiting clients, and PostgreSQL server connection saturation for at least one business cycle.
4. Enable adaptive sizing system-wide after security review confirms no credentials or SQL text are emitted.
5. Roll back by disabling the adaptive apply flag; probes continue reporting health without resizing.
