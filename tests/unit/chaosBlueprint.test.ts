import { describe, expect, it } from "vitest";
import {
  STAGING_CHAOS_BLUEPRINT,
  getExperimentsForService,
  validateChaosBlueprint,
  type ChaosBlueprint,
} from "@/utils/chaosBlueprint";

describe("staging chaos engineering blueprint", () => {
  it("meets latency, availability, security, and rollout guardrails", () => {
    expect(validateChaosBlueprint(STAGING_CHAOS_BLUEPRINT)).toEqual([]);
  });

  it("exposes service-specific experiments for orchestration", () => {
    const walletExperiments = getExperimentsForService("wallet-adapter");

    expect(walletExperiments).toHaveLength(1);
    expect(walletExperiments[0]).toMatchObject({
      id: "wallet-adapter-dependency-failure",
      securityReviewRequired: true,
    });
  });

  it("reports every safety violation with actionable messages", () => {
    const unsafeBlueprint: ChaosBlueprint = {
      ...STAGING_CHAOS_BLUEPRINT,
      p99TargetMs: 150,
      availabilityTargetPercent: 99.9,
      deploymentStrategy: { ...STAGING_CHAOS_BLUEPRINT.deploymentStrategy, mode: "blue-green-with-canary" },
      experiments: [
        {
          ...STAGING_CHAOS_BLUEPRINT.experiments[0],
          securityReviewRequired: false,
          blastRadiusPercent: 25,
          steadyState: { p99LatencyMs: 200, availabilityPercent: 99, errorRatePercent: 0.1 },
          abortConditions: [],
          rollback: [],
          monitoringSignals: ["web_vitals_p99"],
        },
      ],
    };

    expect(validateChaosBlueprint(unsafeBlueprint)).toEqual([
      "Critical path P99 target must be <= 100 ms.",
      "Availability target must be at least 99.99%.",
      "frontend-latency-100ms must require security review.",
      "frontend-latency-100ms blast radius must be between 1% and 10% for staging.",
      "frontend-latency-100ms exceeds the blueprint P99 latency target.",
      "frontend-latency-100ms falls below the blueprint availability target.",
      "frontend-latency-100ms needs abort conditions.",
      "frontend-latency-100ms needs rollback steps.",
      "frontend-latency-100ms needs at least three monitoring signals.",
    ]);
  });
});
