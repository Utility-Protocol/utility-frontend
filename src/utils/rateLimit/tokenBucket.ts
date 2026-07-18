export type TenantId = string;

export interface TenantRateLimitPolicy {
  capacity: number;
  refillRatePerSecond: number;
  ttlMs?: number;
}

export interface RateLimitDecision {
  allowed: boolean;
  tenantId: TenantId;
  limit: number;
  remaining: number;
  retryAfterMs: number;
  resetAt: number;
}

interface BucketState {
  tokens: number;
  updatedAt: number;
  lastSeenAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;

function validatePolicy(policy: TenantRateLimitPolicy): void {
  if (!Number.isFinite(policy.capacity) || policy.capacity <= 0) {
    throw new Error("Rate limit capacity must be a positive finite number.");
  }

  if (!Number.isFinite(policy.refillRatePerSecond) || policy.refillRatePerSecond <= 0) {
    throw new Error("Rate limit refillRatePerSecond must be a positive finite number.");
  }
}

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<TenantId, BucketState>();

  constructor(private readonly now: () => number = Date.now) {}

  consume(
    tenantId: TenantId,
    policy: TenantRateLimitPolicy,
    cost = 1
  ): RateLimitDecision {
    validatePolicy(policy);

    if (!tenantId.trim()) {
      throw new Error("tenantId is required for rate limiting.");
    }

    if (!Number.isFinite(cost) || cost <= 0) {
      throw new Error("Rate limit cost must be a positive finite number.");
    }

    const now = this.now();
    const bucket = this.refill(tenantId, policy, now);
    const allowed = bucket.tokens >= cost;

    if (allowed) {
      bucket.tokens -= cost;
    }

    bucket.lastSeenAt = now;
    this.buckets.set(tenantId, bucket);

    const missingTokens = allowed ? 0 : cost - bucket.tokens;
    const retryAfterMs = Math.ceil((missingTokens / policy.refillRatePerSecond) * 1000);
    const resetAt = Math.ceil(
      now + ((policy.capacity - bucket.tokens) / policy.refillRatePerSecond) * 1000
    );

    return {
      allowed,
      tenantId,
      limit: policy.capacity,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterMs,
      resetAt,
    };
  }

  snapshot(tenantId: TenantId, policy: TenantRateLimitPolicy): RateLimitDecision {
    validatePolicy(policy);

    const now = this.now();
    const bucket = this.refill(tenantId, policy, now);

    return {
      allowed: bucket.tokens >= 1,
      tenantId,
      limit: policy.capacity,
      remaining: Math.max(0, Math.floor(bucket.tokens)),
      retryAfterMs:
        bucket.tokens >= 1
          ? 0
          : Math.ceil(((1 - bucket.tokens) / policy.refillRatePerSecond) * 1000),
      resetAt: Math.ceil(
        now + ((policy.capacity - bucket.tokens) / policy.refillRatePerSecond) * 1000
      ),
    };
  }

  pruneExpired(ttlMs = DEFAULT_TTL_MS): number {
    const cutoff = this.now() - ttlMs;
    let pruned = 0;

    for (const [tenantId, bucket] of this.buckets) {
      if (bucket.lastSeenAt < cutoff) {
        this.buckets.delete(tenantId);
        pruned += 1;
      }
    }

    return pruned;
  }

  size(): number {
    return this.buckets.size;
  }

  private refill(
    tenantId: TenantId,
    policy: TenantRateLimitPolicy,
    now: number
  ): BucketState {
    const existing = this.buckets.get(tenantId) ?? {
      tokens: policy.capacity,
      updatedAt: now,
      lastSeenAt: now,
    };

    const elapsedMs = Math.max(0, now - existing.updatedAt);
    const refilledTokens = (elapsedMs / 1000) * policy.refillRatePerSecond;

    return {
      tokens: Math.min(policy.capacity, existing.tokens + refilledTokens),
      updatedAt: now,
      lastSeenAt: existing.lastSeenAt,
    };
  }
}
