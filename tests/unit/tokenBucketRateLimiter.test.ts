import { describe, expect, it } from "vitest";

import { TokenBucketRateLimiter } from "@/utils/rateLimit/tokenBucket";

const policy = {
  capacity: 3,
  refillRatePerSecond: 1,
};

describe("TokenBucketRateLimiter", () => {
  it("isolates token buckets per tenant", () => {
    const now = 0;
    const limiter = new TokenBucketRateLimiter(() => now);

    expect(limiter.consume("tenant-a", policy).allowed).toBe(true);
    expect(limiter.consume("tenant-a", policy).remaining).toBe(1);
    expect(limiter.consume("tenant-b", policy).remaining).toBe(2);
  });

  it("blocks when the bucket is empty and reports retry metadata", () => {
    const now = 0;
    const limiter = new TokenBucketRateLimiter(() => now);

    limiter.consume("tenant-a", policy);
    limiter.consume("tenant-a", policy);
    limiter.consume("tenant-a", policy);

    const decision = limiter.consume("tenant-a", policy);

    expect(decision.allowed).toBe(false);
    expect(decision.remaining).toBe(0);
    expect(decision.retryAfterMs).toBe(1000);
    expect(decision.resetAt).toBe(3000);
  });

  it("refills tokens over time without exceeding capacity", () => {
    let now = 0;
    const limiter = new TokenBucketRateLimiter(() => now);

    limiter.consume("tenant-a", policy, 3);
    now = 1500;

    const decision = limiter.consume("tenant-a", policy);

    expect(decision.allowed).toBe(true);
    expect(decision.remaining).toBe(0);

    now = 10_000;
    expect(limiter.snapshot("tenant-a", policy).remaining).toBe(3);
  });

  it("prunes idle tenant buckets", () => {
    let now = 0;
    const limiter = new TokenBucketRateLimiter(() => now);

    limiter.consume("tenant-a", policy);
    limiter.consume("tenant-b", policy);
    now = 10_001;

    expect(limiter.pruneExpired(10_000)).toBe(2);
    expect(limiter.size()).toBe(0);
  });

  it("rejects missing tenants and invalid policies", () => {
    const limiter = new TokenBucketRateLimiter(() => 0);

    expect(() => limiter.consume(" ", policy)).toThrow("tenantId is required");
    expect(() => limiter.consume("tenant-a", { capacity: 0, refillRatePerSecond: 1 })).toThrow(
      "capacity"
    );
    expect(() => limiter.consume("tenant-a", { capacity: 1, refillRatePerSecond: 0 })).toThrow(
      "refillRatePerSecond"
    );
  });
});
