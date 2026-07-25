export type MeshMode = "STRICT" | "PERMISSIVE" | "DISABLE";
export type TelemetryLevel = "request" | "workload" | "security";

export interface CriticalPathBudget {
  readonly route: string;
  readonly p99BudgetMs: number;
}

export interface MeshCanaryStep {
  readonly weightPercent: number;
  readonly durationMinutes: number;
}

export interface ServiceMeshPolicy {
  readonly namespace: string;
  readonly mtlsMode: MeshMode;
  readonly availabilityTarget: number;
  readonly criticalPathP99Ms: number;
  readonly telemetryLevels: readonly TelemetryLevel[];
  readonly criticalPaths: readonly CriticalPathBudget[];
  readonly canary: readonly MeshCanaryStep[];
}

export const serviceMeshPolicy: ServiceMeshPolicy = {
  namespace: "utility-frontend",
  mtlsMode: "STRICT",
  availabilityTarget: 0.9999,
  criticalPathP99Ms: 100,
  telemetryLevels: ["request", "workload", "security"],
  criticalPaths: [
    { route: "/", p99BudgetMs: 100 },
    { route: "/export", p99BudgetMs: 100 },
    { route: "/api/telemetry/ingest", p99BudgetMs: 75 },
  ],
  canary: [
    { weightPercent: 5, durationMinutes: 15 },
    { weightPercent: 25, durationMinutes: 30 },
    { weightPercent: 50, durationMinutes: 30 },
    { weightPercent: 100, durationMinutes: 30 },
  ],
};

export function validateServiceMeshPolicy(policy: ServiceMeshPolicy): string[] {
  const errors: string[] = [];

  if (policy.mtlsMode !== "STRICT") errors.push("mTLS mode must be STRICT");
  if (policy.availabilityTarget < 0.9999) {
    errors.push("availability target must be at least 99.99%");
  }
  if (policy.criticalPathP99Ms > 100) {
    errors.push("critical path P99 budget must be <= 100ms");
  }
  if (!policy.telemetryLevels.includes("security")) {
    errors.push("security telemetry must be enabled");
  }
  if (policy.criticalPaths.some((path) => path.p99BudgetMs > policy.criticalPathP99Ms)) {
    errors.push("all critical paths must fit within the global P99 budget");
  }
  if (policy.canary.length === 0 || policy.canary.at(-1)?.weightPercent !== 100) {
    errors.push("canary rollout must end at 100% traffic");
  }

  return errors;
}
