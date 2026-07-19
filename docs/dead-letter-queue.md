# Dead Letter Queue for Failed Message Processing

## Architecture

The frontend message-processing boundary uses `DeadLetterQueue` as the shared guard for messages that cannot be handled successfully after a bounded retry budget. Each message carries an id, type, payload, optional priority, and optional trace id so failures can be correlated with backend logs and alert events.

Processing flow:

1. Handle a message through the registered service-specific handler.
2. Track attempts per message id and return `retryable-failure` until the retry budget is exhausted.
3. Move exhausted messages into the dead-letter collection with failure reason, attempt count, failed timestamp, retryability, and trace metadata.
4. Expose metrics for queue depth, retries, dead-letter count, evictions, and critical-path P99 latency.
5. Replay remediated records through the same handler path so fixes do not bypass validation.

## Operational Targets

- Critical path P99 is measured for `priority: "critical"` messages and should remain under 100 ms.
- Queue metrics should be bridged to the production telemetry sink by the service composing `DeadLetterQueue` via `onMetric`.
- The queue has bounded capacity to protect availability; oldest records are evicted when capacity is reached and the dropped counter increments.

## Alerts and Dashboards

Recommended dashboard panels:

- Dead-letter queue depth by service and message type.
- Retry rate and dead-letter rate over five-minute windows.
- Dropped dead-letter records caused by queue capacity pressure.
- Critical-path P99 latency with a 100 ms threshold line.

Recommended alerts:

- Page when critical-path P99 is above 100 ms for 10 minutes.
- Page when dead-letter depth grows for three consecutive windows.
- Ticket when any dropped dead-letter records are observed.

## Deployment Plan

Use a blue-green deployment with canary analysis:

1. Deploy the new queue path disabled or shadowed in blue.
2. Enable the canary for low-volume message types and compare retry/dead-letter rates against green.
3. Expand to critical message types once P99 remains below 100 ms and no dropped records are observed.
4. Promote blue after dashboard parity and alert health are confirmed.
5. Keep the previous path available for rollback until one full business cycle completes.

## Runbook

1. Open the dead-letter dashboard and identify message types with growing depth.
2. Inspect the record reason and trace id to locate the upstream or handler failure.
3. Fix the underlying schema, payload, network, or handler problem.
4. Replay a small sample through `replayDeadLetter` and confirm the records leave the queue.
5. Replay the remaining affected records and monitor P99 latency plus dropped count.
