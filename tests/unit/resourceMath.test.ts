import { describe, it, expect, vi } from "vitest";
import {
  aggregateReadings,
  perResourceUnits,
  relativeError,
  PRECISION_THRESHOLD,
  MAX_READINGS_PER_WINDOW,
  type Reading,
} from "@/utils/aggregation/resourceMath";
import {
  RESOURCE_FACTORS,
  RESOURCE_TYPES,
  type ResourceType,
} from "@/utils/aggregation/unitConversion";

describe("relativeError", () => {
  it("is 0 when both are zero", () => {
    expect(relativeError(0, BigInt(0))).toBe(0);
  });
  it("is Infinity when exact is zero but approx is not", () => {
    expect(relativeError(5, BigInt(0))).toBe(Infinity);
  });
  it("computes the magnitude of the relative gap", () => {
    expect(relativeError(110, BigInt(100))).toBeCloseTo(0.1, 12);
  });
});

describe("aggregateReadings", () => {
  it("sums exactly across resources", () => {
    const readings: Reading[] = [
      { resource: "water", value: 5 }, // 5000
      { resource: "energy", value: 2 }, // 7,200,000
      { resource: "bandwidth", value: 1 }, // 1,000,000,000
    ];
    const result = aggregateReadings(readings);
    expect(result.exactBase).toBe(BigInt(1_007_205_000));
    expect(result.total.toBaseUnits()).toBe(BigInt(1_007_205_000));
    expect(result.byResource.energy).toBe(BigInt(7_200_000));
    expect(result.readingCount).toBe(3);
  });

  it("handles an empty window without warning", () => {
    const logger = { warn: vi.fn() };
    const result = aggregateReadings([], { logger });
    expect(result.exactBase).toBe(BigInt(0));
    expect(result.relativeError).toBe(0);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("does not warn for well-formed integer readings", () => {
    const logger = { warn: vi.fn() };
    aggregateReadings(
      [
        { resource: "energy", value: BigInt("999999999999") },
        { resource: "water", value: 12345 },
      ],
      { logger }
    );
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("warns when the window exceeds the reading cap", () => {
    const logger = { warn: vi.fn() };
    const readings: Reading[] = Array.from(
      { length: MAX_READINGS_PER_WINDOW + 1 },
      () => ({ resource: "water" as ResourceType, value: 1 })
    );
    aggregateReadings(readings, { logger });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("exceeding")
    );
  });

  it("perResourceUnits wraps each subtotal exactly", () => {
    const result = aggregateReadings([{ resource: "energy", value: 2 }]);
    expect(perResourceUnits(result).energy.toBaseUnits()).toBe(BigInt(7_200_000));
  });
});

describe("property: 10,000 random readings stay within 1e-5 relative error", () => {
  it("keeps the displayed total within tolerance of the exact total", () => {
    // Deterministic LCG so the property test is reproducible.
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };

    const readings: Reading[] = [];
    let independentExact = BigInt(0);
    for (let i = 0; i < 10_000; i++) {
      const resource = RESOURCE_TYPES[Math.floor(rand() * RESOURCE_TYPES.length)];
      const value = BigInt(Math.floor(rand() * 1e15)); // [0, 10^15]
      readings.push({ resource, value });
      independentExact += value * RESOURCE_FACTORS[resource];
    }

    const result = aggregateReadings(readings);

    // The BigInt pipeline matches an independent exact computation.
    expect(result.exactBase).toBe(independentExact);

    // The single lossy Number conversion at display stays well within tolerance.
    const trueVal = result.exactBase;
    const displayedInt = BigInt(Math.round(result.total.toNumber()));
    const diff = displayedInt > trueVal ? displayedInt - trueVal : trueVal - displayedInt;
    const relErr = trueVal === BigInt(0) ? 0 : Number(diff) / Number(trueVal);

    expect(relErr).toBeLessThan(PRECISION_THRESHOLD);
  });
});
