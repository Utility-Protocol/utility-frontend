import { describe, expect, it } from "vitest";
import { serviceMeshPolicy, validateServiceMeshPolicy } from "@/config/serviceMesh";

describe("service mesh policy", () => {
  it("keeps the baseline policy inside the issue bounds", () => {
    expect(validateServiceMeshPolicy(serviceMeshPolicy)).toEqual([]);
  });

  it("rejects permissive mTLS, weak availability, missing security telemetry, and slow paths", () => {
    expect(
      validateServiceMeshPolicy({
        ...serviceMeshPolicy,
        mtlsMode: "PERMISSIVE",
        availabilityTarget: 0.999,
        criticalPathP99Ms: 150,
        telemetryLevels: ["request"],
        criticalPaths: [{ route: "/", p99BudgetMs: 200 }],
        canary: [{ weightPercent: 50, durationMinutes: 10 }],
      }),
    ).toEqual([
      "mTLS mode must be STRICT",
      "availability target must be at least 99.99%",
      "critical path P99 budget must be <= 100ms",
      "security telemetry must be enabled",
      "all critical paths must fit within the global P99 budget",
      "canary rollout must end at 100% traffic",
    ]);
  });
});
