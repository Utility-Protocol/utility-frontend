import { describe, it, expect } from "vitest";
import { decimal, eq } from "@/utils/decimal";
import {
  sumReadings,
  averageReadings,
  minReading,
  maxReading,
  cumulativeTotals,
  aggregateReadings,
  aggregateByWindow,
  applyTariff,
} from "@/utils/aggregation";
import {
  RESOURCE_PRECISION,
  type MeterReading,
  type ResourceKind,
  type TariffRate,
} from "@/types/meter";

function reading(
  resource: ResourceKind,
  value: string,
  timestamp = 0
): MeterReading {
  return {
    meterId: "m1",
    resource,
    timestamp,
    value: decimal(value, RESOURCE_PRECISION[resource]) as MeterReading["value"],
  };
}

describe("sumReadings / averageReadings", () => {
  it("sums electricity readings exactly", () => {
    const readings = [
      reading("electricity", "1.234"),
      reading("electricity", "2.001"),
      reading("electricity", "0.765"),
    ];
    expect(sumReadings(readings, 3).toFixed()).toBe("4.000");
  });

  it("averages exactly", () => {
    const readings = [reading("gas", "1.0000"), reading("gas", "2.0000")];
    expect(averageReadings(readings).toFixed()).toBe("1.5000");
  });

  it("empty sum is zero at the requested precision", () => {
    expect(sumReadings([], 2).toFixed()).toBe("0.00");
  });
});

describe("minReading / maxReading", () => {
  it("returns extremes", () => {
    const readings = [
      reading("water", "10"),
      reading("water", "3"),
      reading("water", "7"),
    ];
    expect(minReading(readings)!.toFixed()).toBe("3");
    expect(maxReading(readings)!.toFixed()).toBe("10");
  });

  it("returns null for an empty list", () => {
    expect(minReading([])).toBeNull();
    expect(maxReading([])).toBeNull();
  });
});

describe("cumulativeTotals", () => {
  it("produces running sums without drift", () => {
    const values = Array.from({ length: 5 }, () => decimal("0.001", 3));
    const totals = cumulativeTotals(values);
    expect(totals.map((d) => d.toFixed())).toEqual([
      "0.001",
      "0.002",
      "0.003",
      "0.004",
      "0.005",
    ]);
  });
});

describe("aggregateReadings", () => {
  it("returns total, count and unit", () => {
    const c = aggregateReadings("electricity", [
      reading("electricity", "1.500"),
      reading("electricity", "2.500"),
    ]);
    expect(c.resource).toBe("electricity");
    expect(c.count).toBe(2);
    expect(c.unit).toBe("kWh");
    expect(c.total.toFixed()).toBe("4.000");
  });
});

describe("aggregateByWindow", () => {
  it("buckets readings by fixed time windows, sorted ascending", () => {
    const hour = 3_600_000;
    const readings = [
      reading("water", "5", 0),
      reading("water", "3", 1_000),
      reading("water", "8", hour + 500),
    ];
    const windows = aggregateByWindow("water", readings, hour);
    expect(windows).toHaveLength(2);
    expect(windows[0].windowStart).toBe(0);
    expect(windows[0].consumption.total.toFixed()).toBe("8");
    expect(windows[1].windowStart).toBe(hour);
    expect(windows[1].consumption.total.toFixed()).toBe("8");
  });
});

describe("applyTariff", () => {
  it("computes cost = total × rate at currency precision", () => {
    const total = decimal("100.000", 3); // kWh
    const rate: TariffRate = {
      resource: "electricity",
      ratePerUnit: decimal("0.15", 2),
      currency: "USD",
    };
    const cost = applyTariff(total, rate);
    expect(cost.precision).toBe(2);
    expect(cost.toFixed()).toBe("15.00");
  });

  it("rounds the cost half-up to 2 decimals", () => {
    const total = decimal("3.333", 3);
    const rate: TariffRate = {
      resource: "electricity",
      ratePerUnit: decimal("0.10", 2),
      currency: "USD",
    };
    // 3.333 × 0.10 = 0.3333 → 0.33
    expect(eq(applyTariff(total, rate), decimal("0.33", 2))).toBe(true);
  });
});
