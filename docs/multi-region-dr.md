# Multi-Region Replication and Disaster Recovery Architecture

## Objectives

- Keep critical user paths below **100 ms P99** during normal operation and failover.
- Maintain at least **99.99% service availability** with one primary and at least one healthy failover region.
- Bound replication lag to **5 seconds** for operational data used by dashboards, tariff edits, wallet flows, and telemetry views.
- Require security review before promoting a new region, changing replication policy, or executing destructive recovery operations.

## Architecture

1. **Active-primary / hot-replica topology**: one region serves writes while hot replicas continuously consume ordered change streams.
2. **Regional health model**: each region reports role, health, P99 latency, replication lag, and last recovery point.
3. **Failover decisioning**: failover automation promotes the healthy non-primary region with the lowest replication lag, using P99 latency as a tie-breaker.
4. **Blue-green deployment**: disaster recovery changes are deployed to green regional stacks, validated, then shifted through canary traffic before global promotion.
5. **Canary analysis**: promotion is blocked when canary error rate exceeds 2%, security review is incomplete, or recovery objectives are missed.

## Monitoring and Alerts

| Signal | Warning | Page |
| --- | ---: | ---: |
| Critical path P99 latency | > 90 ms | > 100 ms |
| Replication lag | > 3,000 ms | > 5,000 ms |
| Healthy regions | 2 | < 2 |
| Estimated availability | < 99.99% | < 99.9% |
| Canary error rate | > 1% | > 2% |

Dashboards should chart these signals by region and include the recommended failover target emitted by `assessDisasterRecoveryReadiness`.

## Disaster Recovery Test Plan

1. Run steady-state validation and confirm every region has recent recovery points.
2. Freeze risky deploys and confirm incident commander, security reviewer, and regional owners are assigned.
3. Simulate primary write outage and verify the recommended failover region matches the lowest-lag healthy replica.
4. Promote the failover region in green, replay replication queues, and run canary analysis.
5. Shift traffic gradually, watching latency, lag, canary error rate, and data consistency checks.
6. Record recovery time, data loss window, security review result, and rollback notes.
7. Restore the original primary as a replica only after consistency checks pass.

## Security Review Gates

- Replication credentials are region-scoped and rotated after each exercise.
- Recovery runbooks require dual approval for promotion, rollback, and data re-seeding.
- Audit logs must capture actor, region, recovery point, and canary decision for every drill.
