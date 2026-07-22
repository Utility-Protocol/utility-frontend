# Redis-backed in-memory cache

## Architecture

The cache layer is a two-tier service:

1. An in-process LRU memory cache for sub-millisecond repeat reads on hot critical paths.
2. An optional Redis adapter for shared, cross-instance durability. Redis failures are treated as best-effort and fall back to the local in-memory tier so request handling remains available.

`RedisBackedCache` stores JSON-serialized values under namespaced keys and applies a configurable TTL to every write. Services should wrap expensive calls with `systemCache.remember(key, factory, ttlMs)` so a miss computes and stores the value once while subsequent reads are served from cache.

## Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `CACHE_NAMESPACE` | `utility` | Prefix isolating cache keys per environment. |
| `CACHE_DEFAULT_TTL_MS` | `60000` | Default TTL for entries that do not provide one. |
| `CACHE_MAX_MEMORY_ENTRIES` | `1000` | Maximum hot entries retained by the in-process tier. |
| `UPSTASH_REDIS_REST_URL` | unset | Enables the shared Redis tier through the Upstash Redis REST API. |
| `UPSTASH_REDIS_REST_TOKEN` | unset | Bearer token for the shared Redis tier. |

Choose TTLs per data domain. Critical paths should use the shortest TTL that still keeps P99 latency under 100ms without serving unsafe stale data.

## Monitoring and alerts

Expose `snapshotMetrics()` to telemetry and alert on:

- sustained `misses / (hits + misses) > 0.25` for critical paths;
- any `redisFallbacks` burst lasting longer than five minutes;
- rising `errors` or `evictions` after a deployment.

Dashboards should chart hit rate, miss rate, Redis fallback count, write/delete volume, and memory evictions by service and cache namespace.

## Deployment and operations

Deploy with blue-green infrastructure. During canary analysis, compare hit rate, Redis fallbacks, P99 latency, and error rate between the old and new pools before shifting all traffic.

Runbook:

1. If Redis is degraded, keep traffic on the active pool; the cache continues from memory but hit rate may drop after restarts.
2. Lower `CACHE_DEFAULT_TTL_MS` for data correctness incidents, then invalidate affected key namespaces.
3. Raise `CACHE_MAX_MEMORY_ENTRIES` only after checking process memory headroom.
4. Roll back if P99 latency exceeds 100ms or Redis fallback alerts remain active after remediation.
