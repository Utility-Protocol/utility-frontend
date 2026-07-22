export type PoolHealthStatus = "healthy" | "degraded" | "critical";

export interface PostgresPoolSnapshot {
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  maxConnections: number;
  probeLatencyMs: number;
  errorCount: number;
  timestamp: number;
}

export interface AdaptivePoolSizingPolicy {
  minConnections: number;
  maxConnections: number;
  targetUtilization: number;
  scaleUpStep: number;
  scaleDownStep: number;
  latencyBudgetMs: number;
  waitingClientThreshold: number;
  cooldownMs: number;
}

export interface PoolHealthAssessment {
  status: PoolHealthStatus;
  utilization: number;
  recommendedMaxConnections: number;
  reasons: string[];
  alertSeverity: "none" | "warning" | "page";
  metrics: Record<string, number>;
}

export const DEFAULT_POOL_SIZING_POLICY: AdaptivePoolSizingPolicy = {
  minConnections: 4,
  maxConnections: 80,
  targetUtilization: 0.7,
  scaleUpStep: 4,
  scaleDownStep: 2,
  latencyBudgetMs: 100,
  waitingClientThreshold: 2,
  cooldownMs: 30_000,
};

export function assessPostgresPoolHealth(
  snapshot: PostgresPoolSnapshot,
  policy: AdaptivePoolSizingPolicy = DEFAULT_POOL_SIZING_POLICY,
  previousResizeAt = 0
): PoolHealthAssessment {
  const totalConnections = snapshot.activeConnections + snapshot.idleConnections;
  const utilization = snapshot.maxConnections > 0 ? snapshot.activeConnections / snapshot.maxConnections : 1;
  const reasons: string[] = [];
  const canResize = snapshot.timestamp - previousResizeAt >= policy.cooldownMs;
  let recommendedMaxConnections = clamp(snapshot.maxConnections, policy.minConnections, policy.maxConnections);

  if (snapshot.probeLatencyMs > policy.latencyBudgetMs) {
    reasons.push(`Probe latency ${snapshot.probeLatencyMs}ms exceeds ${policy.latencyBudgetMs}ms budget`);
  }
  if (snapshot.waitingClients > policy.waitingClientThreshold) {
    reasons.push(`${snapshot.waitingClients} clients are waiting for a connection`);
  }
  if (snapshot.errorCount > 0) {
    reasons.push(`${snapshot.errorCount} probe errors observed`);
  }
  if (utilization >= policy.targetUtilization || snapshot.waitingClients > 0) {
    reasons.push(`Pool utilization is ${(utilization * 100).toFixed(1)}%`);
    if (canResize) {
      recommendedMaxConnections = clamp(
        snapshot.maxConnections + policy.scaleUpStep,
        policy.minConnections,
        policy.maxConnections
      );
    }
  } else if (utilization < policy.targetUtilization * 0.45 && snapshot.waitingClients === 0 && canResize) {
    recommendedMaxConnections = clamp(
      snapshot.maxConnections - policy.scaleDownStep,
      policy.minConnections,
      policy.maxConnections
    );
    reasons.push("Pool has sustained spare capacity and can scale down");
  }

  const critical = snapshot.errorCount >= 3 || snapshot.probeLatencyMs >= policy.latencyBudgetMs * 2;
  const degraded = reasons.length > 0 || totalConnections > snapshot.maxConnections;

  return {
    status: critical ? "critical" : degraded ? "degraded" : "healthy",
    utilization,
    recommendedMaxConnections,
    reasons: reasons.length > 0 ? reasons : ["Probe latency and pool pressure are within policy"],
    alertSeverity: critical ? "page" : degraded ? "warning" : "none",
    metrics: {
      "postgres_pool_active_connections": snapshot.activeConnections,
      "postgres_pool_idle_connections": snapshot.idleConnections,
      "postgres_pool_waiting_clients": snapshot.waitingClients,
      "postgres_pool_max_connections": snapshot.maxConnections,
      "postgres_pool_probe_latency_ms": snapshot.probeLatencyMs,
      "postgres_pool_utilization_ratio": utilization,
      "postgres_pool_recommended_max_connections": recommendedMaxConnections,
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
