# Distributed Job Scheduler Architecture

The scheduler uses lease-based worker claiming so only one worker executes a job at a time while allowing automatic recovery if a worker crashes. Jobs are persisted with `queued`, `leased`, `completed`, or `failed` state, a due time, priority, attempt count, and lease owner metadata.

## Critical path

1. Producers enqueue a deterministic job id and payload.
2. Workers poll their queue and atomically claim due jobs whose state is `queued` or whose lease has expired.
3. A claimed job receives a lease owner and expiry. Workers must complete, fail, or renew before expiry.
4. Expired leases are claimable by another worker; stale workers cannot complete or renew after expiry.
5. Failed jobs are retried with backoff until `maxAttempts`, then moved to terminal `failed` state.

## Production storage contract

Back this interface with a datastore that supports conditional writes in a single partition/key transaction, for example `UPDATE ... WHERE status = queued OR lease_expires_at <= now`. Keep queue, due time, and priority indexed to preserve the sub-100 ms P99 claim path.

## Monitoring and alerts

Export `SchedulerMetrics` as counters/gauges: queued jobs, leased jobs, completed jobs, failed jobs, expired lease count, and claim latency. Alert when claim P99 exceeds 100 ms, failed jobs grow for 5 minutes, or expired leases spike above the canary baseline.

## Blue-green and canary deployment

Run green workers in shadow claim mode first, then canary 5% of queues by queue prefix or shard. Compare claim latency, duplicate execution guards, failure rate, and expired lease rate before shifting the remaining traffic.
