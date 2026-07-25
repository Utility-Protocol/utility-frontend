# Disaster Recovery Testing Runbook

## Pre-flight

- Confirm there are at least two healthy regions and one available primary.
- Confirm replication lag is below 5,000 ms in every serving region.
- Confirm critical path P99 latency is below 100 ms.
- Confirm the security reviewer has approved the drill window.

## Execution

1. Announce the drill and set the incident channel topic to the drill ID.
2. Capture the current readiness assessment and recommended failover region.
3. Disable writes in the primary test cell or inject a controlled primary outage.
4. Promote the recommended failover region through the green environment.
5. Route 5%, 25%, 50%, then 100% of traffic if canary error rate remains below 2%.
6. Record recovery time objective (RTO), recovery point objective (RPO), canary error rate, and security gate status.

## Rollback

- Stop traffic shifting immediately if P99 latency exceeds 100 ms, replication lag exceeds 5,000 ms, or canary error rate exceeds 2%.
- Re-route traffic to the last healthy serving region.
- Keep the failed region isolated until audit logs and consistency checks are complete.

## Evidence

Attach the readiness assessment, canary report, security approval, and timeline to the incident record before closing the drill.
