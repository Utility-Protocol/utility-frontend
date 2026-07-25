# API Rate Limiting with Per-Tenant Token Buckets

## Goals

- Enforce tenant-scoped quotas before expensive request handling begins.
- Keep the critical path below 100ms P99 by using O(1) in-memory bucket updates.
- Preserve availability by failing closed only for malformed policies and returning deterministic `429` responses for exhausted tenants.

## Architecture

Requests are mapped to a tenant by `x-tenant-id`, then `x-api-key-tenant`, then the `anonymous` fallback. Each tenant owns an independent token bucket with:

- `capacity`: maximum burst size.
- `refillRatePerSecond`: sustained request rate.
- `ttlMs`: idle bucket retention window.

The shared route helper consumes tokens and emits standard `RateLimit-*` and `Retry-After` headers. Services should invoke `checkTenantRateLimit()` at the top of every App Router route handler, then return `rateLimitResponse()` when present.

## Monitoring and alerts

Track these metrics per tenant and route:

- `rate_limit_allowed_total`
- `rate_limit_blocked_total`
- `rate_limit_remaining_tokens`
- `rate_limit_decision_latency_ms`

Alert when blocked traffic exceeds 5% for a tenant for 5 minutes, decision latency exceeds 25ms P99, or anonymous traffic exceeds expected baselines.

## Deployment

1. Ship the helper dark-launched with headers only.
2. Enable enforcement for internal tenants during a blue-green deployment.
3. Canary 5%, 25%, 50%, then 100% of external traffic while comparing `429` rates and route latency.
4. Roll back by disabling enforcement or restoring the previous green environment.

## Security notes

Tenant identity must come from trusted authentication middleware in production. Direct `x-tenant-id` use is acceptable only behind an API gateway that strips untrusted inbound tenant headers and injects verified values.
