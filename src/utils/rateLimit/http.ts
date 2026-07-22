import { TokenBucketRateLimiter, type RateLimitDecision, type TenantRateLimitPolicy } from "./tokenBucket";

export const DEFAULT_TENANT_RATE_LIMIT_POLICY: TenantRateLimitPolicy = {
  capacity: 120,
  refillRatePerSecond: 20,
  ttlMs: 10 * 60 * 1000,
};

export const tenantRateLimiter = new TokenBucketRateLimiter();

export function resolveTenantId(request: Request): string {
  const tenantId = request.headers.get("x-tenant-id")?.trim();
  const apiKeyTenant = request.headers.get("x-api-key-tenant")?.trim();

  if (tenantId) return tenantId;
  if (apiKeyTenant) return apiKeyTenant;

  return "anonymous";
}

export function rateLimitHeaders(decision: RateLimitDecision): HeadersInit {
  const headers: Record<string, string> = {
    "RateLimit-Limit": String(decision.limit),
    "RateLimit-Remaining": String(decision.remaining),
    "RateLimit-Reset": String(Math.ceil(decision.resetAt / 1000)),
    "X-RateLimit-Tenant": decision.tenantId,
  };

  if (!decision.allowed) {
    headers["Retry-After"] = String(Math.ceil(decision.retryAfterMs / 1000));
  }

  return headers;
}

export function checkTenantRateLimit(
  request: Request,
  policy: TenantRateLimitPolicy = DEFAULT_TENANT_RATE_LIMIT_POLICY,
  cost = 1
): RateLimitDecision {
  const tenantId = resolveTenantId(request);
  const decision = tenantRateLimiter.consume(tenantId, policy, cost);

  if (policy.ttlMs) {
    tenantRateLimiter.pruneExpired(policy.ttlMs);
  }

  return decision;
}

export function rateLimitResponse(decision: RateLimitDecision): Response | null {
  if (decision.allowed) return null;

  return Response.json(
    {
      error: "rate_limited",
      message: "Tenant request quota exceeded. Retry after the advertised delay.",
      tenantId: decision.tenantId,
      retryAfterMs: decision.retryAfterMs,
    },
    {
      status: 429,
      headers: rateLimitHeaders(decision),
    }
  );
}
