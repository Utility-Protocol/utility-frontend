import { describe, expect, it, vi } from "vitest";
import { planCapacity, type HistoricalReading } from "@/utils/capacityPlanning";

describe("planCapacity", () => {
  it("projects historical growth and recommends margin-adjusted capacity", () => {
    vi.setSystemTime(new Date("2026-07-18T00:00:00Z"));
    const hour = 60 * 60 * 1000;
    const readings: HistoricalReading[] = [
      { resource: "water", value: 10, timestamp: 0 },
      { resource: "water", value: 20, timestamp: hour },
      { resource: "water", value: 40, timestamp: 2 * hour },
    ];

    const plan = planCapacity(
      readings,
      [{ resource: "water", capacityBase: 85_000 }],
      { windowMs: hour, horizonWindows: 2, safetyMargin: 0.1 }
    );

    expect(plan.generatedAt).toBe(Date.parse("2026-07-18T00:00:00Z"));
    expect(plan.forecasts.water.currentBase).toBe(BigInt(40_000));
    expect(plan.forecasts.water.trendPerWindowBase).toBe(BigInt(15_000));
    expect(plan.forecasts.water.projectedBase).toBe(BigInt(70_000));
    expect(plan.forecasts.water.recommendedCapacityBase).toBe(BigInt(77_000));
    expect(plan.forecasts.water.status).toBe("watch");
    vi.useRealTimers();
  });

  it("marks exhausted resources critical immediately", () => {
    const plan = planCapacity(
      [{ resource: "energy", value: 2, timestamp: 0 }],
      [{ resource: "energy", capacityBase: 1 }],
      { windowMs: 1000, horizonWindows: 1 }
    );

    expect(plan.forecasts.energy.exhaustedAtWindow).toBe(0);
    expect(plan.forecasts.energy.status).toBe("critical");
  });

  it("validates planning bounds", () => {
    expect(() =>
      planCapacity([], [], { windowMs: 0, horizonWindows: 1 })
    ).toThrow("windowMs must be positive");
    expect(() =>
      planCapacity([], [], { windowMs: 1, horizonWindows: -1 })
    ).toThrow("horizonWindows cannot be negative");
  });
});
