import { describe, it, expect } from "vitest";
import { ResourceUnits } from "@/utils/aggregation/ResourceUnits";

describe("ResourceUnits", () => {
  it("wraps and unwraps exact base units", () => {
    const u = ResourceUnits.fromBaseUnits(BigInt(5));
    expect(u.toBaseUnits()).toBe(BigInt(5));
    expect(u.toNumber()).toBe(5);
  });

  it("adds exactly, even beyond Number.MAX_SAFE_INTEGER", () => {
    const a = ResourceUnits.fromBaseUnits(BigInt("999999999999999999999"));
    const b = ResourceUnits.fromBaseUnits(BigInt(1));
    expect(a.add(b).toBaseUnits()).toBe(BigInt("1000000000000000000000"));
  });

  it("multiplies by an integer factor exactly", () => {
    const u = ResourceUnits.fromBaseUnits(BigInt("1000000000000")); // 1e12
    expect(u.multiply(BigInt(3_600_000)).toBaseUnits()).toBe(
      BigInt("3600000000000000000")
    );
  });

  it("rejects a non-integer multiply factor", () => {
    expect(() => ResourceUnits.fromBaseUnits(BigInt(1)).multiply(1.5)).toThrow();
  });

  it("aligns scales when adding", () => {
    const a = new ResourceUnits(BigInt(150), 2); // 1.50
    const b = new ResourceUnits(BigInt(2500), 3); // 2.500
    const sum = a.add(b); // 4.000
    expect(sum.scale).toBe(3);
    expect(sum.toNumber()).toBeCloseTo(4, 10);
  });

  it("preserves fractional precision at large magnitude in toNumber", () => {
    // 1e18 base units + 0.25 (at scale 2) → 1e18 + 0.25
    const u = new ResourceUnits(BigInt("100000000000000000025"), 2);
    expect(u.toNumber()).toBeCloseTo(1e18 + 0.25, 0);
  });

  it("rejects an invalid scale", () => {
    expect(() => new ResourceUnits(BigInt(0), -1)).toThrow();
    expect(() => new ResourceUnits(BigInt(0), 1.5)).toThrow();
  });

  it("compares for equality across scales", () => {
    expect(
      ResourceUnits.fromBaseUnits(BigInt(5), 0).equals(
        new ResourceUnits(BigInt(500), 2)
      )
    ).toBe(true);
  });

  it("formats with 2–4 fraction digits", () => {
    const s = ResourceUnits.fromBaseUnits(BigInt(7)).toDisplay(4, 2);
    expect(s).toMatch(/7[.,]00/);
  });
});
