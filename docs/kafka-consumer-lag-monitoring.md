# Kafka Consumer Lag Monitoring and Auto-Scaling

## Architecture

1. **Lag collectors** poll Kafka committed offsets and broker high-watermarks for every production consumer group.
2. **Policy evaluation** normalizes per-partition lag, groups by consumer group, and classifies health as `healthy`, `watch`, or `critical`.
3. **Autoscaling adapters** convert lag summaries into bounded replica recommendations for KEDA/HPA controllers.
4. **Observability** publishes `kafka_consumer_group_lag`, `kafka_consumer_group_lag_max_partition`, `kafka_consumer_group_lag_stale`, and `kafka_consumer_group_replicas_desired` metrics.
5. **Operator dashboards** show backlog, max partition skew, stale telemetry, and the current scaling decision for each group.

## Policy Defaults

| Setting | Default | Purpose |
| --- | ---: | --- |
| Warning lag | 10,000 messages | Opens an investigation before SLO risk. |
| Critical lag | 50,000 messages | Pages and triggers aggressive scale-out. |
| Stale sample timeout | 120 seconds | Treats missing telemetry as critical. |
| Minimum replicas | 2 | Keeps warm capacity for 99.99% availability. |
| Maximum replicas | 30 | Protects downstream services and costs. |
| Lag per replica | 5,000 messages | Backlog drained per replica inside the SLO window. |
| Max scaling step | 4 replicas | Avoids oscillation during short spikes. |

## Alerting

- Page when a group remains `critical` for two consecutive evaluations or when lag telemetry is stale.
- Warn when a group remains in `watch` for five minutes.
- Create an incident when desired replicas equal the maximum and lag continues to rise.
- Include topic, partition count, max partition lag, total lag, desired replicas, and current deployment color in every alert.

## Blue-Green and Canary Rollout

1. Deploy lag collectors and scaling adapters to the green environment with autoscaling in dry-run mode.
2. Mirror Kafka offset samples from blue and compare recommendations for at least one business cycle.
3. Enable canary scaling for one low-risk consumer group and verify P99 critical paths stay below 100 ms.
4. Increase canary coverage to 25%, 50%, and 100% if lag recovery improves and error budgets remain healthy.
5. Promote green only after dashboards, alerts, and rollback commands are verified.

## Runbook

1. Check whether lag samples are stale. If stale, inspect collector health and Kafka ACLs first.
2. If lag is isolated to one partition, rebalance keys or split the hot partition before raising max replicas.
3. If lag is system-wide, confirm downstream write latency and pause scale-out if dependencies are saturated.
4. Use the recommendation helper in `src/utils/kafkaConsumerLag.ts` as the source of truth for manual replica overrides.
5. Roll back to the previous deployment color if autoscaling increases errors or P99 latency exceeds 100 ms.
