import { describe, it, expect } from "vitest";
import { backoffCeiling, fullJitterBackoff } from "@/utils/backoff";

describe("backoffCeiling", () => {
  it("grows exponentially from the base", () => {
    expect(backoffCeiling(0, 500, 30_000)).toBe(500);
    expect(backoffCeiling(1, 500, 30_000)).toBe(1000);
    expect(backoffCeiling(2, 500, 30_000)).toBe(2000);
    expect(backoffCeiling(3, 500, 30_000)).toBe(4000);
  });

  it("clamps to the cap", () => {
    // 500 * 2^7 = 64000 > 30000 cap
    expect(backoffCeiling(7, 500, 30_000)).toBe(30_000);
    expect(backoffCeiling(20, 500, 30_000)).toBe(30_000);
  });

  it("never overflows to Infinity for huge attempts", () => {
    expect(backoffCeiling(2000, 500, 30_000)).toBe(30_000);
  });

  it("returns 0 for negative attempts", () => {
    expect(backoffCeiling(-1)).toBe(0);
  });
});

describe("fullJitterBackoff", () => {
  it("returns 0 when rng yields 0", () => {
    expect(fullJitterBackoff(3, 500, 30_000, () => 0)).toBe(0);
  });

  it("returns ~half the ceiling at rng=0.5", () => {
    // ceiling(3) = 4000 → 0.5 * 4000 = 2000
    expect(fullJitterBackoff(3, 500, 30_000, () => 0.5)).toBe(2000);
  });

  it("never exceeds the ceiling even at rng→1", () => {
    const ceiling = backoffCeiling(2, 500, 30_000); // 2000
    const value = fullJitterBackoff(2, 500, 30_000, () => 0.9999999);
    expect(value).toBeLessThanOrEqual(ceiling);
    expect(value).toBeGreaterThan(0);
  });

  it("stays within [0, cap] across many random draws", () => {
    let seed = 1;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let attempt = 0; attempt < 12; attempt++) {
      for (let i = 0; i < 50; i++) {
        const d = fullJitterBackoff(attempt, 500, 30_000, rng);
        expect(d).toBeGreaterThanOrEqual(0);
        expect(d).toBeLessThanOrEqual(30_000);
      }
    }
  });
});
