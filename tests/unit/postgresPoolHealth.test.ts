import { describe, expect, it } from "vitest";
import { assessPostgresPoolHealth, DEFAULT_POOL_SIZING_POLICY } from "@/services/postgresPoolHealth";

const baseSnapshot = {
  activeConnections: 8,
  idleConnections: 4,
  waitingClients: 0,
  maxConnections: 20,
  probeLatencyMs: 24,
  errorCount: 0,
  timestamp: 60_000,
};

describe("assessPostgresPoolHealth", () => {
  it("reports healthy pools without changing size", () => {
    const assessment = assessPostgresPoolHealth(baseSnapshot);

    expect(assessment.status).toBe("healthy");
    expect(assessment.alertSeverity).toBe("none");
    expect(assessment.recommendedMaxConnections).toBe(20);
  });

  it("recommends scaling up under connection pressure", () => {
    const assessment = assessPostgresPoolHealth({
      ...baseSnapshot,
      activeConnections: 18,
      waitingClients: 3,
    });

    expect(assessment.status).toBe("degraded");
    expect(assessment.alertSeverity).toBe("warning");
    expect(assessment.recommendedMaxConnections).toBe(24);
    expect(assessment.reasons.some((reason) => reason.includes("clients are waiting"))).toBe(true);
  });

  it("pages on repeated probe errors and respects the maximum bound", () => {
    const assessment = assessPostgresPoolHealth({
      ...baseSnapshot,
      activeConnections: 78,
      maxConnections: 80,
      probeLatencyMs: 225,
      errorCount: 3,
    });

    expect(assessment.status).toBe("critical");
    expect(assessment.alertSeverity).toBe("page");
    expect(assessment.recommendedMaxConnections).toBe(DEFAULT_POOL_SIZING_POLICY.maxConnections);
  });

  it("does not resize during cooldown", () => {
    const assessment = assessPostgresPoolHealth(
      { ...baseSnapshot, activeConnections: 18, waitingClients: 4 },
      DEFAULT_POOL_SIZING_POLICY,
      45_000
    );

    expect(assessment.recommendedMaxConnections).toBe(20);
  });
});
