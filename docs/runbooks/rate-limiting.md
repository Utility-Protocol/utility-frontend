# Rate Limiting Runbook

## Symptoms

- Tenants receive HTTP `429` responses.
- `rate_limit_blocked_total` increases for one or more routes.
- Support reports missing or low `RateLimit-Remaining` headers.

## Triage

1. Confirm the tenant ID and route from logs or response headers.
2. Check `rate_limit_blocked_total` and `rate_limit_decision_latency_ms` dashboards.
3. Compare current request rate with the configured tenant policy.
4. Verify the gateway is injecting a trusted tenant identity.

## Mitigation

- For legitimate bursts, temporarily raise `capacity` for the impacted tenant.
- For sustained growth, raise `refillRatePerSecond` after capacity planning.
- For abusive traffic, keep enforcement enabled and notify security.
- If enforcement causes broad false positives, roll back to the previous blue-green environment.

## Post-incident

Document the tenant, policy, blocked duration, customer impact, and whether dashboard or alert thresholds need adjustment.
