# Webhook Delivery Service Architecture

## Goals

The webhook delivery service provides authenticated, observable event delivery to customer endpoints without adding synchronous latency to critical product paths.

- **Critical path target:** enqueue webhook work in less than 100 ms P99; network delivery happens asynchronously.
- **Availability target:** 99.99% service uptime through durable queues, idempotent workers, and blue-green deploys.
- **Security target:** every request is signed with an HMAC-SHA256 signature and verified using constant-time comparison helpers.

## Request flow

1. Product services create a `WebhookEvent` after committing the source transaction.
2. The event is persisted to a durable queue/outbox with endpoint metadata.
3. Workers use `WebhookDeliveryService` to POST the stable JSON body to each endpoint.
4. Each request includes `x-webhook-event-id`, `x-webhook-event-type`, `x-webhook-timestamp`, and `x-webhook-signature` headers.
5. Non-2xx responses and transport errors are retried with capped exponential full-jitter backoff.
6. Final failures are retained for operator review and customer replay tooling.

## Signature contract

The signature base string is:

```text
<ISO-8601 timestamp>.<stable JSON request body>
```

The `x-webhook-signature` header uses the format `v1=<hex hmac sha256>`. Consumers should reject requests when the timestamp is outside the configured replay window or `verifyWebhookSignature` returns false.

## Retry policy

Defaults are intentionally conservative:

- maximum attempts: 5
- base delay: 1 second
- maximum delay: 60 seconds
- jitter: full jitter to avoid synchronized retry storms

Endpoint-specific overrides can lower or raise the attempt budget when required by customer contracts.

## Monitoring and alerts

Dashboards should track:

- enqueue latency P50/P95/P99
- delivery latency P50/P95/P99
- success rate by endpoint and event type
- retry count and final failure count
- queue depth and oldest pending event age
- signature verification failures reported by first-party receivers

Alert when final failures exceed baseline, queue age breaches the SLO budget, or worker error rate indicates an availability risk.

## Deployment

Deploy workers with a blue-green strategy. Send a canary percentage of queued deliveries through the green pool, compare success rate and latency against blue, then gradually shift traffic. Roll back immediately on elevated final failures, signature mismatch spikes, or queue-age regression.
