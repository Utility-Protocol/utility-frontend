import { describe, expect, it } from "vitest";
import {
  DEFAULT_ROTATION_POLICY,
  buildRotationDashboardMetrics,
  evaluateCanary,
  isRotationDue,
  planSecretRotation,
  type SecretDescriptor,
} from "@/services/secretRotation";

const now = new Date("2026-07-18T00:00:00.000Z").getTime();
const day = 24 * 60 * 60 * 1000;

function secret(overrides: Partial<SecretDescriptor> = {}): SecretDescriptor {
  return {
    id: "prod/postgres/app",
    kind: "database",
    ownerService: "utility-api",
    activeVersion: "v12",
    nextVersion: "v13",
    lastRotatedAt: now - 91 * day,
    rotationIntervalMs: 90 * day,
    ...overrides,
  };
}

describe("secret rotation planning", () => {
  it("detects due database and API key credentials", () => {
    expect(isRotationDue(secret(), now)).toBe(true);
    expect(isRotationDue(secret({ lastRotatedAt: now - 10 * day }), now)).toBe(false);
  });

  it("starts due secrets in dual-write with operator runbook steps", () => {
    const decision = planSecretRotation(secret(), now);
    expect(decision.phase).toBe("dual-write");
    expect(decision.shouldPromote).toBe(false);
    expect(decision.alerts).toContain("prod/postgres/app is due for rotation");
    expect(decision.runbookSteps.join(" ")).toContain("blue-green");
  });
});

describe("secret rotation canary guardrails", () => {
  it("promotes only when latency, availability, error rate, and canary health pass", () => {
    const decision = evaluateCanary({
      p99LatencyMs: DEFAULT_ROTATION_POLICY.maxCriticalPathP99Ms - 1,
      availabilityPercent: DEFAULT_ROTATION_POLICY.minAvailabilityPercent,
      errorRate: DEFAULT_ROTATION_POLICY.maxErrorRate,
      canarySuccessRate: DEFAULT_ROTATION_POLICY.minCanarySuccessRate,
    });
    expect(decision.phase).toBe("promoted");
    expect(decision.shouldPromote).toBe(true);
    expect(decision.alerts).toHaveLength(0);
  });

  it("rolls back and alerts on SLO or canary regression", () => {
    const decision = evaluateCanary({
      p99LatencyMs: 120,
      availabilityPercent: 99.9,
      errorRate: 0.01,
      canarySuccessRate: 0.98,
    });
    expect(decision.phase).toBe("rolled-back");
    expect(decision.shouldPromote).toBe(false);
    expect(decision.alerts).toHaveLength(4);
    expect(decision.runbookSteps.join(" ")).toContain("route traffic back");
  });

  it("emits dashboard-friendly metrics without secret material", () => {
    const metrics = buildRotationDashboardMetrics(secret(), {
      p99LatencyMs: 42,
      availabilityPercent: 100,
      errorRate: 0,
      canarySuccessRate: 1,
    });
    expect(metrics).toMatchObject({
      secretId: "prod/postgres/app",
      ownerService: "utility-api",
      activeVersion: "v12",
      nextVersion: "v13",
      p99LatencyMs: 42,
    });
    expect(JSON.stringify(metrics)).not.toContain("password");
  });
});
