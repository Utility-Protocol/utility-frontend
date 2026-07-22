# Distributed Job Scheduler Runbook

## Symptoms

- Queue depth increasing while workers are healthy.
- Claim latency over 100 ms P99.
- Expired leases or failed jobs increasing rapidly.

## Triage

1. Check scheduler dashboards for queued, leased, failed, expired lease, and claim latency metrics.
2. Verify datastore conditional-write latency and error rate.
3. Confirm workers renew leases before half the lease TTL elapses.
4. Pause canary traffic if the green deployment has higher failures than blue.

## Recovery

- Scale workers for queue-depth pressure.
- Increase lease TTL only if jobs are legitimately longer than the current TTL.
- Requeue terminal failures only after confirming the handler is idempotent and the root cause is resolved.
