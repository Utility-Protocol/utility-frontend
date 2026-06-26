import { describe, it, expect } from "vitest";
import {
  RESOURCE_FACTORS,
  RESOURCE_FACTORS_NUMBER,
  convertToBase,
  convertToBaseApprox,
  toBigIntReading,
} from "@/utils/aggregation/unitConversion";

describe("resource factors", () => {
  it("are the exact BigInt invariants", () => {
    expect(RESOURCE_FACTORS.water).toBe(BigInt(1000));
    expect(RESOURCE_FACTORS.energy).toBe(BigInt(3_600_000));
    expect(RESOURCE_FACTORS.bandwidth).toBe(BigInt(1_000_000_000));
  });

  it("mirror the Number factors used by the audit", () => {
    expect(RESOURCE_FACTORS_NUMBER.energy).toBe(3.6e6);
  });
});

describe("convertToBase", () => {
  it("is exact for the pathological energy reading", () => {
    // 999,999,999,999 × 3,600,000 — the value that drifts under Number math.
    expect(convertToBase("energy", BigInt("999999999999"))).toBe(
      BigInt("3599999999996400000")
    );
  });

  it("accepts number, string and bigint readings", () => {
    expect(convertToBase("water", 5)).toBe(BigInt(5000));
    expect(convertToBase("water", "5")).toBe(BigInt(5000));
    expect(convertToBase("water", BigInt(5))).toBe(BigInt(5000));
  });

  it("the Number approximation loses the low-order digits", () => {
    const exact = convertToBase("energy", BigInt("999999999999"));
    const approx = convertToBaseApprox("energy", BigInt("999999999999"));
    // The double cannot represent the exact integer; it rounds.
    expect(BigInt(Math.round(approx))).not.toBe(exact);
  });
});

describe("toBigIntReading", () => {
  it("truncates an incidental fractional part", () => {
    expect(toBigIntReading(12.9)).toBe(BigInt(12));
  });

  it("throws on non-finite input", () => {
    expect(() => toBigIntReading(Infinity)).toThrow();
    expect(() => toBigIntReading(NaN)).toThrow();
  });
});
