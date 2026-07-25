import { describe, expect, it, vi } from "vitest";
import { RedisBackedCache, createUpstashRedisAdapter, type RedisCacheAdapter } from "@/services/redisCache";

function clock(start = 1_000) {
  let now = start;
  return { now: () => now, tick: (ms: number) => (now += ms) };
}

describe("RedisBackedCache", () => {
  it("serves fresh values from memory within the configured TTL", async () => {
    const time = clock();
    const cache = new RedisBackedCache({ now: time.now, defaultTtlMs: 500 });

    await cache.set("critical-path", { ok: true });
    time.tick(499);

    expect(await cache.get("critical-path")).toEqual({ ok: true });
    expect(cache.snapshotMetrics().hits).toBe(1);
  });

  it("expires memory entries and reports a miss after TTL", async () => {
    const time = clock();
    const cache = new RedisBackedCache({ now: time.now, defaultTtlMs: 100 });

    await cache.set("quote", 10);
    time.tick(101);

    expect(await cache.get("quote")).toBeNull();
    expect(cache.snapshotMetrics()).toMatchObject({ misses: 1, evictions: 1 });
  });

  it("hydrates memory from Redis and namespaces keys", async () => {
    const adapter: RedisCacheAdapter = {
      get: vi.fn(async () => JSON.stringify({ from: "redis" })),
      set: vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
    };
    const cache = new RedisBackedCache({ namespace: "test", redis: adapter });

    expect(await cache.get("ledger:latest")).toEqual({ from: "redis" });
    expect(adapter.get).toHaveBeenCalledWith("test:ledger:latest");
  });

  it("falls back to memory when Redis writes fail", async () => {
    const adapter: RedisCacheAdapter = {
      get: vi.fn(async () => null),
      set: vi.fn(async () => { throw new Error("redis down"); }),
      delete: vi.fn(async () => undefined),
    };
    const cache = new RedisBackedCache({ redis: adapter });

    await cache.set("asset", { id: "A" });

    expect(await cache.get("asset")).toEqual({ id: "A" });
    expect(cache.snapshotMetrics()).toMatchObject({ errors: 1, redisFallbacks: 1 });
  });

  it("creates an Upstash Redis REST adapter", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ result: "OK" }), { status: 200 })
    );
    const adapter = createUpstashRedisAdapter({
      url: "https://redis.example.com",
      token: "secret",
      fetchImpl,
    });

    await adapter.set("utility:key", "value", 250);

    expect(fetchImpl).toHaveBeenCalledWith("https://redis.example.com", {
      method: "POST",
      headers: {
        Authorization: "Bearer secret",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(["SET", "utility:key", "value", "PX", 250]),
    });
  });

  it("coalesces cache misses with remember", async () => {
    const cache = new RedisBackedCache();
    const factory = vi.fn(async () => "value");

    await expect(cache.remember("expensive", factory)).resolves.toBe("value");
    await expect(cache.remember("expensive", factory)).resolves.toBe("value");

    expect(factory).toHaveBeenCalledTimes(1);
  });
});
