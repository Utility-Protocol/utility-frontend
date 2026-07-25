export interface CacheMetrics {
  hits: number;
  misses: number;
  writes: number;
  deletes: number;
  errors: number;
  evictions: number;
  redisFallbacks: number;
}

export interface CacheOptions {
  namespace?: string;
  defaultTtlMs?: number;
  maxEntries?: number;
  now?: () => number;
  redis?: RedisCacheAdapter;
  onMetric?: (metric: keyof CacheMetrics, value: number) => void;
}

export interface RedisCacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

interface MemoryEntry {
  value: string;
  expiresAt: number;
  lastAccessedAt: number;
}

export const DEFAULT_CACHE_TTL_MS = 60_000;
export const DEFAULT_MAX_CACHE_ENTRIES = 1_000;

export class RedisBackedCache {
  private readonly namespace: string;
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly now: () => number;
  private readonly redis?: RedisCacheAdapter;
  private readonly onMetric?: (metric: keyof CacheMetrics, value: number) => void;
  private readonly memory = new Map<string, MemoryEntry>();
  private readonly metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    writes: 0,
    deletes: 0,
    errors: 0,
    evictions: 0,
    redisFallbacks: 0,
  };

  constructor(options: CacheOptions = {}) {
    this.namespace = options.namespace ?? "utility";
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_CACHE_TTL_MS;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_CACHE_ENTRIES;
    this.now = options.now ?? Date.now;
    this.redis = options.redis;
    this.onMetric = options.onMetric;
  }

  async get<T>(key: string): Promise<T | null> {
    const namespacedKey = this.key(key);
    const memoryValue = this.getFromMemory(namespacedKey);
    if (memoryValue !== null) {
      this.record("hits");
      return this.parse<T>(memoryValue);
    }

    if (this.redis) {
      try {
        const redisValue = await this.redis.get(namespacedKey);
        if (redisValue !== null) {
          this.memory.set(namespacedKey, {
            value: redisValue,
            expiresAt: this.now() + this.defaultTtlMs,
            lastAccessedAt: this.now(),
          });
          this.evictIfNeeded();
          this.record("hits");
          return this.parse<T>(redisValue);
        }
      } catch {
        this.record("errors");
        this.record("redisFallbacks");
      }
    }

    this.record("misses");
    return null;
  }

  async set<T>(key: string, value: T, ttlMs = this.defaultTtlMs): Promise<void> {
    const namespacedKey = this.key(key);
    const serialized = JSON.stringify(value);
    this.memory.set(namespacedKey, {
      value: serialized,
      expiresAt: this.now() + ttlMs,
      lastAccessedAt: this.now(),
    });
    this.evictIfNeeded();

    if (this.redis) {
      try {
        await this.redis.set(namespacedKey, serialized, ttlMs);
      } catch {
        this.record("errors");
        this.record("redisFallbacks");
      }
    }

    this.record("writes");
  }

  async delete(key: string): Promise<void> {
    const namespacedKey = this.key(key);
    this.memory.delete(namespacedKey);
    if (this.redis) {
      try {
        await this.redis.delete(namespacedKey);
      } catch {
        this.record("errors");
        this.record("redisFallbacks");
      }
    }
    this.record("deletes");
  }

  async remember<T>(key: string, factory: () => Promise<T>, ttlMs = this.defaultTtlMs): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await this.set(key, value, ttlMs);
    return value;
  }

  clearMemory(): void {
    this.memory.clear();
  }

  snapshotMetrics(): CacheMetrics {
    return { ...this.metrics };
  }

  private getFromMemory(key: string): string | null {
    const entry = this.memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.memory.delete(key);
      this.record("evictions");
      return null;
    }
    entry.lastAccessedAt = this.now();
    return entry.value;
  }

  private key(key: string): string {
    return `${this.namespace}:${key}`;
  }

  private parse<T>(value: string): T | null {
    try {
      return JSON.parse(value) as T;
    } catch {
      this.record("errors");
      return null;
    }
  }

  private evictIfNeeded(): void {
    while (this.memory.size > this.maxEntries) {
      let oldestKey: string | undefined;
      let oldestAccess = Infinity;
      for (const [key, entry] of this.memory) {
        if (entry.lastAccessedAt < oldestAccess) {
          oldestAccess = entry.lastAccessedAt;
          oldestKey = key;
        }
      }
      if (!oldestKey) return;
      this.memory.delete(oldestKey);
      this.record("evictions");
    }
  }

  private record(metric: keyof CacheMetrics): void {
    this.metrics[metric] += 1;
    this.onMetric?.(metric, this.metrics[metric]);
  }
}

export function createUpstashRedisAdapter(options: {
  url: string;
  token: string;
  fetchImpl?: typeof fetch;
}): RedisCacheAdapter {
  const fetcher = options.fetchImpl ?? fetch;
  const request = async <T>(command: unknown[]): Promise<T> => {
    const response = await fetcher(options.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${options.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
    });

    if (!response.ok) {
      throw new Error(`Redis request failed with ${response.status}`);
    }

    const payload = (await response.json()) as { result?: T; error?: string };
    if (payload.error) throw new Error(payload.error);
    return payload.result as T;
  };

  return {
    get: (key) => request<string | null>(["GET", key]),
    set: async (key, value, ttlMs) => {
      await request<string>(["SET", key, value, "PX", ttlMs]);
    },
    delete: async (key) => {
      await request<number>(["DEL", key]);
    },
  };
}

export function createCacheFromEnv(env: Record<string, string | undefined> = process.env): RedisBackedCache {
  const redis =
    env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN
      ? createUpstashRedisAdapter({
          url: env.UPSTASH_REDIS_REST_URL,
          token: env.UPSTASH_REDIS_REST_TOKEN,
        })
      : undefined;

  return new RedisBackedCache({
    namespace: env.CACHE_NAMESPACE,
    defaultTtlMs: parsePositiveInt(env.CACHE_DEFAULT_TTL_MS, DEFAULT_CACHE_TTL_MS),
    maxEntries: parsePositiveInt(env.CACHE_MAX_MEMORY_ENTRIES, DEFAULT_MAX_CACHE_ENTRIES),
    redis,
  });
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const systemCache = createCacheFromEnv();
