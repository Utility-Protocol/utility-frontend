import { describe, expect, it } from "vitest";
import {
  assessDisasterRecoveryReadiness,
  calculateAvailability,
  evaluateDrill,
  recommendFailoverRegion,
  type RegionReplicationState,
} from "@/utils/disasterRecovery";

const regions: RegionReplicationState[] = [
  {
    region: "us-east-1",
    role: "primary",
    health: "healthy",
    replicationLagMs: 800,
    p99LatencyMs: 72,
    lastRecoveryPointIso: "2026-07-18T00:00:00.000Z",
  },
  {
    region: "us-west-2",
    role: "replica",
    health: "healthy",
    replicationLagMs: 500,
    p99LatencyMs: 80,
    lastRecoveryPointIso: "2026-07-18T00:00:01.000Z",
  },
  {
    region: "eu-central-1",
    role: "standby",
    health: "healthy",
    replicationLagMs: 1_200,
    p99LatencyMs: 91,
    lastRecoveryPointIso: "2026-07-18T00:00:00.000Z",
  },
];

describe("disaster recovery readiness", () => {
  it("calculates weighted regional availability", () => {
    expect(calculateAvailability([
      regions[0],
      { ...regions[1], health: "degraded" },
      { ...regions[2], health: "unavailable" },
    ])).toBe(50);
  });

  it("recommends the healthy non-primary with the lowest lag", () => {
    expect(recommendFailoverRegion(regions)?.region).toBe("us-west-2");
  });

  it("passes when latency, lag, availability, and failover capacity meet objectives", () => {
    const assessment = assessDisasterRecoveryReadiness(regions, {
      p99LatencyMs: 100,
      maxReplicationLagMs: 5_000,
      minHealthyRegions: 2,
      availabilityTarget: 99.99,
    });

    expect(assessment.status).toBe("pass");
    expect(assessment.recommendedFailoverRegion).toBe("us-west-2");
    expect(assessment.failedChecks).toHaveLength(0);
  });

  it("fails when there is no healthy failover region and critical targets are missed", () => {
    const assessment = assessDisasterRecoveryReadiness([
      { ...regions[0], health: "unavailable", p99LatencyMs: 140 },
      { ...regions[1], health: "degraded", replicationLagMs: 6_000 },
    ]);

    expect(assessment.status).toBe("fail");
    expect(assessment.failedChecks).toEqual(expect.arrayContaining([
      "No available primary region is serving critical traffic.",
      "No healthy replica or standby region is available for failover.",
    ]));
  });

  it("evaluates drill outcomes against security, canary, RTO, and RPO gates", () => {
    expect(evaluateDrill({
      id: "dr-001",
      name: "primary evacuation",
      executedAtIso: "2026-07-18T00:00:00.000Z",
      recoveryTimeSeconds: 240,
      dataLossSeconds: 30,
      canaryErrorRate: 0.005,
      securityReviewPassed: true,
    })).toBe("pass");
    expect(evaluateDrill({
      id: "dr-002",
      name: "regional restore",
      executedAtIso: "2026-07-18T00:00:00.000Z",
      recoveryTimeSeconds: 420,
      dataLossSeconds: 30,
      canaryErrorRate: 0.005,
      securityReviewPassed: true,
    })).toBe("warning");
    expect(evaluateDrill({
      id: "dr-003",
      name: "canary rollback",
      executedAtIso: "2026-07-18T00:00:00.000Z",
      recoveryTimeSeconds: 120,
      dataLossSeconds: 10,
      canaryErrorRate: 0.04,
      securityReviewPassed: true,
    })).toBe("fail");
  });
});
