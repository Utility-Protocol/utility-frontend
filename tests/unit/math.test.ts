import { describe, it, expect } from "vitest";
import BigNumber from "bignumber.js";
import {
  SCALE,
  SCALE_FACTOR,
  I128_MAX,
  validateScale,
  toContractUnits,
  fromContractUnits,
  addSafe,
  subtractSafe,
  multiplySafe,
  divideSafe,
  OverflowError,
  ScaleValidationError,
} from "@/utils/math";

// Note: the issue specifies src/__tests__/math.test.ts, but the project's vitest
// config only picks up tests/**/*.test.{ts,tsx}; placed here so it runs in CI.

describe("constants", () => {
  it("SCALE is 7 and SCALE_FACTOR is 10^7", () => {
    expect(SCALE).toBe(7);
    expect(SCALE_FACTOR.toFixed(0)).toBe("10000000");
  });
});

describe("validateScale", () => {
  it("accepts up to 7 decimal places", () => {
    expect(validateScale("1.2345678")).toEqual({ valid: true });
    expect(validateScale("0.0000001")).toEqual({ valid: true });
    expect(validateScale("-1.5")).toEqual({ valid: true });
    expect(validateScale("0")).toEqual({ valid: true });
  });

  it("rejects more than 7 decimal places", () => {
    const r = validateScale("1.23456789");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/decimal places/);
  });

  it("rejects sub-1e-7 rates like 0.00000001 (the round-to-zero bug)", () => {
    expect(validateScale("0.00000001").valid).toBe(false);
  });

  it("accepts exponential notation only for safe integers", () => {
    expect(validateScale("1e7")).toEqual({ valid: true });
    expect(validateScale("1.5e3")).toEqual({ valid: true }); // 1500
    expect(validateScale("1.5e-3").valid).toBe(false); // 0.0015, not integer
    expect(validateScale("1e20").valid).toBe(false); // not a safe integer
  });

  it("rejects an integer part beyond 10^12", () => {
    expect(validateScale("1000000000000").valid).toBe(true); // exactly 10^12
    const r = validateScale("10000000000000"); // 10^13
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/integer part/);
  });

  it("rejects non-numbers and empty input", () => {
    expect(validateScale("abc").valid).toBe(false);
    expect(validateScale("").valid).toBe(false);
    expect(validateScale("  ").valid).toBe(false);
  });
});

describe("toContractUnits", () => {
  it("scales whole and fractional values", () => {
    expect(toContractUnits("1")).toBe("10000000");
    expect(toContractUnits("0")).toBe("0");
    expect(toContractUnits("-1.5")).toBe("-15000000");
    expect(toContractUnits("0.0000001")).toBe("1");
  });

  it("explicitly truncates beyond 7 decimals (no silent rounding up)", () => {
    expect(toContractUnits("1.99999999")).toBe("19999999"); // truncated, not 20000000
    expect(toContractUnits("0.00000001")).toBe("0");
  });

  it("strict mode rejects values with excess precision", () => {
    expect(() => toContractUnits("1.23456789", { strict: true })).toThrow(
      ScaleValidationError
    );
    expect(() => toContractUnits("0.00000001", { strict: true })).toThrow();
  });

  it("throws on i128 overflow", () => {
    expect(() => toContractUnits("1e32")).toThrow(OverflowError);
  });

  it("throws on invalid numeric input", () => {
    expect(() => toContractUnits("not-a-number")).toThrow(ScaleValidationError);
  });
});

describe("fromContractUnits", () => {
  it("descales to a 7-decimal string", () => {
    expect(fromContractUnits("10000000")).toBe("1.0000000");
    expect(fromContractUnits("0")).toBe("0.0000000");
    expect(fromContractUnits("-15000000")).toBe("-1.5000000");
    expect(fromContractUnits("1")).toBe("0.0000001");
  });

  it("round-trips through toContractUnits", () => {
    for (const v of ["3.1415926", "0.0000001", "123456.789", "-42.5"]) {
      expect(fromContractUnits(toContractUnits(v))).toBe(new BigNumber(v).toFixed(7));
    }
  });

  it("handles the maximum i128 contract value", () => {
    expect(() => fromContractUnits(I128_MAX.toFixed(0))).not.toThrow();
  });
});

describe("safe arithmetic", () => {
  it("adds, subtracts, multiplies and divides", () => {
    expect(addSafe("1.5", "2.5")).toBe("4.0000000");
    expect(subtractSafe("5", "3")).toBe("2.0000000");
    expect(multiplySafe("2", "3")).toBe("6.0000000");
    expect(divideSafe("1", "4")).toBe("0.2500000");
  });

  it("handles zero and negative operands", () => {
    expect(addSafe("0", "0")).toBe("0.0000000");
    expect(subtractSafe("0", "5")).toBe("-5.0000000");
    expect(multiplySafe("-2", "3")).toBe("-6.0000000");
  });

  it("throws on division by zero", () => {
    expect(() => divideSafe("1", "0")).toThrow(OverflowError);
  });

  it("throws on overflow past i128", () => {
    expect(() => addSafe("1e31", "1e31")).toThrow(OverflowError);
    expect(() => multiplySafe("1e20", "1e20")).toThrow(OverflowError);
  });

  it("allows values right up to the i128 boundary", () => {
    const maxDecimal = I128_MAX.div(SCALE_FACTOR).integerValue().toFixed(0);
    expect(() => addSafe(maxDecimal, "0")).not.toThrow();
  });
});
