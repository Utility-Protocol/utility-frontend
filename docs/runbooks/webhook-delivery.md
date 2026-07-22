# Webhook Delivery Runbook

## Triage checklist

1. Check queue depth and oldest pending webhook age.
2. Compare delivery success rate by endpoint, event type, and worker version.
3. Inspect final failures for HTTP status patterns such as 401, 403, 429, or 5xx.
4. Confirm recent deploy state and canary analysis results.
5. Validate that endpoint secrets were not rotated without updating receivers.

## Common remediations

- **Customer endpoint outage:** pause the endpoint, notify the customer, and replay retained events after recovery.
- **Elevated 429 responses:** reduce per-endpoint concurrency and let full-jitter retry smooth the backlog.
- **Signature mismatches:** verify the shared secret, timestamp parsing, stable JSON body, and `v1=` signature format.
- **Worker regression:** route traffic back to the blue pool, drain in-flight green deliveries, and open an incident review.

## Security review notes

- Secrets must be stored in managed secret storage and never logged.
- Log event IDs and endpoint IDs, not payload bodies or signatures.
- Signature verification must use constant-time comparison.
- Replay protection should reject stale timestamps at receivers.
