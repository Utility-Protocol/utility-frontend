export type RegionRole = "primary" | "replica" | "standby";
export type RegionHealth = "healthy" | "degraded" | "unavailable";
export type DrillStatus = "pass" | "warning" | "fail";

export interface RegionReplicationState {
  region: string;
  role: RegionRole;
  health: RegionHealth;
  replicationLagMs: number;
  p99LatencyMs: number;
  lastRecoveryPointIso: string;
}

export interface RecoveryObjective {
  p99LatencyMs: number;
  maxReplicationLagMs: number;
  minHealthyRegions: number;
  availabilityTarget: number;
}

export interface DisasterRecoveryDrill {
  id: string;
  name: string;
  executedAtIso: string;
  recoveryTimeSeconds: number;
  dataLossSeconds: number;
  canaryErrorRate: number;
  securityReviewPassed: boolean;
}

export interface DisasterRecoveryAssessment {
  status: DrillStatus;
  availabilityPercent: number;
  healthyRegions: number;
  activePrimary: RegionReplicationState | null;
  maxReplicationLagMs: number;
  maxP99LatencyMs: number;
  recommendedFailoverRegion: string | null;
  failedChecks: string[];
  warnings: string[];
}

export const DEFAULT_RECOVERY_OBJECTIVE: RecoveryObjective = {
  p99LatencyMs: 100,
  maxReplicationLagMs: 5_000,
  minHealthyRegions: 2,
  availabilityTarget: 99.99,
};

export function calculateAvailability(regions: RegionReplicationState[]): number {
  if (regions.length === 0) return 0;
  const healthyWeight = regions.reduce((total, region) => {
    if (region.health === "healthy") return total + 1;
    if (region.health === "degraded") return total + 0.5;
    return total;
  }, 0);
  return Number(((healthyWeight / regions.length) * 100).toFixed(3));
}

export function recommendFailoverRegion(
  regions: RegionReplicationState[]
): RegionReplicationState | null {
  const candidates = regions
    .filter((region) => region.role !== "primary" && region.health === "healthy")
    .sort((a, b) => {
      const lagDelta = a.replicationLagMs - b.replicationLagMs;
      if (lagDelta !== 0) return lagDelta;
      return a.p99LatencyMs - b.p99LatencyMs;
    });
  return candidates[0] ?? null;
}

export function assessDisasterRecoveryReadiness(
  regions: RegionReplicationState[],
  objective: RecoveryObjective = DEFAULT_RECOVERY_OBJECTIVE
): DisasterRecoveryAssessment {
  const failedChecks: string[] = [];
  const warnings: string[] = [];
  const healthyRegions = regions.filter((region) => region.health === "healthy").length;
  const activePrimary = regions.find((region) => region.role === "primary") ?? null;
  const maxReplicationLagMs = Math.max(0, ...regions.map((region) => region.replicationLagMs));
  const maxP99LatencyMs = Math.max(0, ...regions.map((region) => region.p99LatencyMs));
  const availabilityPercent = calculateAvailability(regions);
  const recommendedFailover = recommendFailoverRegion(regions);

  if (!activePrimary || activePrimary.health === "unavailable") {
    failedChecks.push("No available primary region is serving critical traffic.");
  }
  if (healthyRegions < objective.minHealthyRegions) {
    failedChecks.push(`Healthy region count ${healthyRegions} is below required ${objective.minHealthyRegions}.`);
  }
  if (maxReplicationLagMs > objective.maxReplicationLagMs) {
    failedChecks.push(`Replication lag ${maxReplicationLagMs}ms exceeds ${objective.maxReplicationLagMs}ms objective.`);
  }
  if (maxP99LatencyMs > objective.p99LatencyMs) {
    failedChecks.push(`P99 latency ${maxP99LatencyMs}ms exceeds ${objective.p99LatencyMs}ms target.`);
  }
  if (availabilityPercent < objective.availabilityTarget) {
    warnings.push(`Estimated availability ${availabilityPercent}% is below ${objective.availabilityTarget}% target.`);
  }
  if (!recommendedFailover) {
    failedChecks.push("No healthy replica or standby region is available for failover.");
  }

  return {
    status: failedChecks.length > 0 ? "fail" : warnings.length > 0 ? "warning" : "pass",
    availabilityPercent,
    healthyRegions,
    activePrimary,
    maxReplicationLagMs,
    maxP99LatencyMs,
    recommendedFailoverRegion: recommendedFailover?.region ?? null,
    failedChecks,
    warnings,
  };
}

export function evaluateDrill(drill: DisasterRecoveryDrill): DrillStatus {
  if (!drill.securityReviewPassed || drill.canaryErrorRate > 0.02) return "fail";
  if (drill.recoveryTimeSeconds > 300 || drill.dataLossSeconds > 60) return "warning";
  return "pass";
}
