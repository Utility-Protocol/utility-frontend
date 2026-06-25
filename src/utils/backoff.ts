/**
 * Capped exponential backoff with full-jitter randomization.
 *
 * Full jitter (per AWS's "Exponential Backoff And Jitter") spreads retries
 * uniformly across `[0, ceiling]` instead of clustering them at a fixed delay,
 * which prevents synchronized clients from forming reconnect storms against a
 * load-balanced backend.
 */

import {
  BACKOFF_MULTIPLIER,
  INITIAL_BACKOFF_MS,
  MAX_BACKOFF_MS,
} from "@/types/connection";

/**
 * The deterministic ceiling for a given attempt: `min(cap, base * mult^attempt)`.
 * `attempt` is zero-based (attempt 0 is the first retry).
 */
export function backoffCeiling(
  attempt: number,
  base: number = INITIAL_BACKOFF_MS,
  cap: number = MAX_BACKOFF_MS,
  multiplier: number = BACKOFF_MULTIPLIER
): number {
  if (attempt < 0) return 0;
  // Guard against Infinity from a huge exponent before the min() clamp.
  const exp = Math.pow(multiplier, attempt);
  const raw = Number.isFinite(exp) ? base * exp : Infinity;
  return Math.min(cap, raw);
}

/**
 * Full-jitter delay for an attempt: a uniform random value in
 * `[0, backoffCeiling(attempt)]`. `rng` is injectable for deterministic tests
 * (defaults to `Math.random`).
 */
export function fullJitterBackoff(
  attempt: number,
  base: number = INITIAL_BACKOFF_MS,
  cap: number = MAX_BACKOFF_MS,
  rng: () => number = Math.random
): number {
  const ceiling = backoffCeiling(attempt, base, cap);
  // Clamp rng into [0, 1) defensively, then scale and round to whole ms.
  const r = Math.min(0.999999, Math.max(0, rng()));
  return Math.round(r * ceiling);
}
