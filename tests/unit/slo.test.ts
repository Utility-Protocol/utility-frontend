import { describe, expect, it } from "vitest";
import {
  DEFAULT_BURN_RATE_THRESHOLDS,
  calculateBurnRate,
  calculateCompliance,
  calculateErrorBudgetRemaining,
  evaluateBurnRateAlerts,
  type SloMeasurement,
  type SloObjective,
} from "@/utils/slo";

const objective: SloObjective = {
  id: "availability",
  name: "Availability",
  target: 0.9999,
  latencyP99TargetMs: 100,
  window: "24h",
};

function measurement(window: SloMeasurement["window"], goodEvents: number, totalEvents = 1_000_000, latencyP99Ms = 80): SloMeasurement {
  return { objectiveId: objective.id, goodEvents, totalEvents, latencyP99Ms, window };
}

describe("SLO burn-rate utilities", () => {
  it("calculates compliance with safe empty-window defaults", () => {
    expect(calculateCompliance({ goodEvents: 999_900, totalEvents: 1_000_000 })).toBe(0.9999);
    expect(calculateCompliance({ goodEvents: 0, totalEvents: 0 })).toBe(1);
  });

  it("calculates budget remaining and burn rate against the objective", () => {
    const data = measurement("1h", 999_800);
    expect(calculateBurnRate(objective, data)).toBeCloseTo(2, 6);
    expect(calculateErrorBudgetRemaining(objective, data)).toBe(0);
  });

  it("emits multi-window alerts when burn rates exceed thresholds", () => {
    const alerts = evaluateBurnRateAlerts(
      [objective],
      [measurement("5m", 998_000), measurement("1h", 999_000)],
      DEFAULT_BURN_RATE_THRESHOLDS
    );

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ objectiveId: "availability", severity: "page" });
    expect(alerts[0].message).toContain("Availability page alert");
  });

  it("alerts on latency regressions even before error budget burn exceeds threshold", () => {
    const alerts = evaluateBurnRateAlerts([objective], [measurement("1h", 999_950, 1_000_000, 120), measurement("24h", 999_950)]);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("watch");
  });
});
