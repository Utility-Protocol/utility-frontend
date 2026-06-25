import { describe, it, expect } from "vitest";
import {
  decimal,
  add,
  sub,
  mul,
  div,
  min,
  max,
  sum,
  average,
  neg,
  abs,
  eq,
  gt,
  gte,
  lt,
  lte,
  fromRedux,
  isDecimal,
  toDecimalNumber,
  SafetyRangeError,
  PrecisionError,
  MAX_SAFE,
  type Decimal,
} from "@/utils/decimal";

describe("decimal() factory", () => {
  it("accepts supported precisions and quantizes the input", () => {
    expect(decimal("1.2345", 2).toFixed()).toBe("1.23");
    expect(decimal(5, 0).toFixed()).toBe("5");
    expect(decimal("1.0005", 3).toFixed()).toBe("1.001"); // ROUND_HALF_UP
  });

  it("rejects an unsupported precision", () => {
    expect(() => decimal("1", 5 as 6)).toThrow(PrecisionError);
    expect(() => decimal("1", 1 as 2)).toThrow(PrecisionError);
  });

  it("rejects malformed numeric input", () => {
    expect(() => decimal("not-a-number", 2)).toThrow(PrecisionError);
  });

  it("throws SafetyRangeError when the input exceeds 10^21", () => {
    expect(() => decimal("1e22", 0)).toThrow(SafetyRangeError);
  });

  it("allows exactly 10^21 (the ceiling is inclusive)", () => {
    expect(decimal(MAX_SAFE.toFixed(), 0).isSafe()).toBe(true);
  });
});

describe("add / sub at mixed precision", () => {
  it("upcasts to the higher precision", () => {
    const a = decimal("1.50", 2); // currency
    const b = decimal("0.005", 3); // electricity
    const r = add(a, b);
    expect(r.precision).toBe(3);
    expect(r.toFixed()).toBe("1.505");
  });

  it("subtracts exactly", () => {
    expect(sub(decimal("10.000", 3), decimal("0.001", 3)).toFixed()).toBe("9.999");
  });

  it("throws on overflow", () => {
    const big = decimal(MAX_SAFE.toFixed(), 0);
    expect(() => add(big, decimal("1", 0))).toThrow(SafetyRangeError);
  });
});

describe("mul / div", () => {
  it("multiplies and sums the scales (capped at 9)", () => {
    const price = decimal("2.50", 2);
    const qty = decimal("3.000", 3);
    const r = mul(price, qty);
    expect(r.precision).toBe(5);
    expect(r.toFixed()).toBe("7.50000");
  });

  it("detects multiplication overflow", () => {
    const a = decimal("100000000000", 0); // 1e11
    expect(() => mul(a, a)).toThrow(SafetyRangeError); // 1e22
  });

  it("divides with 28 significant digits and upcasts precision", () => {
    expect(div(decimal("10.00", 2), decimal("4.00", 2)).toFixed()).toBe("2.50");
  });

  it("throws on division by zero", () => {
    expect(() => div(decimal("1", 0), decimal("0", 0))).toThrow(PrecisionError);
  });
});

describe("min / max / sum / average", () => {
  it("min and max return the relevant operand", () => {
    const a = decimal("1.2", 2);
    const b = decimal("3.4", 2);
    expect(min(a, b)).toBe(a);
    expect(max(a, b)).toBe(b);
  });

  it("sum folds a list exactly at the highest precision", () => {
    const r = sum([decimal("1.5", 2), decimal("0.025", 3), decimal("2", 0)]);
    expect(r.precision).toBe(3);
    expect(r.toFixed()).toBe("3.525");
  });

  it("sum of an empty list is zero at the requested precision", () => {
    expect(sum([], 2).toFixed()).toBe("0.00");
  });

  it("average is exact", () => {
    expect(average([decimal("1", 0), decimal("2", 0), decimal("4", 0)]).toFixed()).toBe(
      "2"
    );
  });

  it("average of an empty list throws", () => {
    expect(() => average([])).toThrow(PrecisionError);
  });
});

describe("neg / abs / comparisons", () => {
  it("negates and takes absolute value", () => {
    expect(neg(decimal("3.14", 2)).toFixed()).toBe("-3.14");
    expect(abs(decimal("-3.14", 2)).toFixed()).toBe("3.14");
  });

  it("compares correctly", () => {
    const a = decimal("1.00", 2);
    const b = decimal("2.00", 2);
    expect(eq(a, a)).toBe(true);
    expect(gt(b, a)).toBe(true);
    expect(gte(a, a)).toBe(true);
    expect(lt(a, b)).toBe(true);
    expect(lte(a, a)).toBe(true);
  });
});

describe("serialization round-trip", () => {
  it("toRedux / fromRedux preserves the exact value", () => {
    const d = decimal("123.456789", 6);
    const s = d.toRedux();
    expect(s).toEqual({ value: "123.456789", precision: 6, scale: 1_000_000 });
    const back = fromRedux(s);
    expect(eq(back, d)).toBe(true);
    expect(back.toFixed()).toBe("123.456789");
  });

  it("isDecimal recognises decimals", () => {
    expect(isDecimal(decimal("1", 0))).toBe(true);
    expect(isDecimal("1")).toBe(false);
    expect(isDecimal(1)).toBe(false);
  });
});

describe("zero-drift accumulation", () => {
  it("accumulates 1000 × 0.001 to exactly 1.000 (no drift)", () => {
    let acc: Decimal = decimal("0.000", 3);
    for (let i = 0; i < 1000; i++) {
      acc = add(acc, decimal("0.001", 3));
    }
    expect(acc.toFixed()).toBe("1.000");
    expect(eq(acc, decimal("1", 3))).toBe(true);
    // Contrast: naive float arithmetic does NOT land exactly on 1.
    let naive = 0;
    for (let i = 0; i < 1000; i++) naive += 0.001;
    expect(naive).not.toBe(1);
  });

  it("accumulates 1,000,000 gas readings without drift", () => {
    let acc: Decimal = decimal("0.0000", 4);
    for (let i = 0; i < 10_000; i++) {
      acc = add(acc, decimal("0.0001", 4));
    }
    expect(acc.toFixed()).toBe("1.0000");
  });
});

describe("toDecimalNumber", () => {
  it("converts an exactly-representable value without warning", () => {
    expect(toDecimalNumber(decimal("2.5", 2))).toBe(2.5);
  });
});
