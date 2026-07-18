export type ChaosExperimentType =
  | "latency"
  | "network-partition"
  | "dependency-failure"
  | "resource-pressure"
  | "restart";

export type ChaosService =
  | "frontend"
  | "api-gateway"
  | "telemetry-stream"
  | "wallet-adapter"
  | "background-workers";

export interface ChaosSteadyState {
  p99LatencyMs: number;
  availabilityPercent: number;
  errorRatePercent: number;
}

export interface ChaosAbortCondition {
  metric: keyof ChaosSteadyState | "securityFinding";
  operator: ">" | ">=" | "<" | "<=" | "=";
  threshold: number | boolean;
  durationSeconds: number;
}

export interface ChaosExperiment {
  id: string;
  name: string;
  type: ChaosExperimentType;
  services: ChaosService[];
  hypothesis: string;
  blastRadiusPercent: number;
  durationMinutes: number;
  steadyState: ChaosSteadyState;
  abortConditions: ChaosAbortCondition[];
  rollback: string[];
  securityReviewRequired: boolean;
  monitoringSignals: string[];
}

export interface ChaosBlueprint {
  environment: "staging";
  p99TargetMs: number;
  availabilityTargetPercent: number;
  experiments: ChaosExperiment[];
  deploymentStrategy: {
    mode: "blue-green-with-canary";
    canaryPercentages: number[];
    analysisWindowMinutes: number;
  };
}

export const STAGING_CHAOS_BLUEPRINT: ChaosBlueprint = {
  environment: "staging",
  p99TargetMs: 100,
  availabilityTargetPercent: 99.99,
  deploymentStrategy: {
    mode: "blue-green-with-canary",
    canaryPercentages: [1, 5, 25, 50, 100],
    analysisWindowMinutes: 15,
  },
  experiments: [
    {
      id: "frontend-latency-100ms",
      name: "Frontend critical-path latency injection",
      type: "latency",
      services: ["frontend", "api-gateway"],
      hypothesis:
        "Critical user journeys remain below the 100 ms P99 budget while latency is injected at the edge.",
      blastRadiusPercent: 5,
      durationMinutes: 10,
      steadyState: { p99LatencyMs: 100, availabilityPercent: 99.99, errorRatePercent: 0.1 },
      abortConditions: [
        { metric: "p99LatencyMs", operator: ">", threshold: 100, durationSeconds: 120 },
        { metric: "availabilityPercent", operator: "<", threshold: 99.99, durationSeconds: 60 },
        { metric: "securityFinding", operator: "=", threshold: true, durationSeconds: 0 },
      ],
      rollback: ["Disable edge latency fault", "Shift traffic back to blue", "Page staging incident lead"],
      securityReviewRequired: true,
      monitoringSignals: ["web_vitals_p99", "api_gateway_p99", "synthetic_checkout_success"],
    },
    {
      id: "telemetry-stream-partition",
      name: "Telemetry stream network partition",
      type: "network-partition",
      services: ["telemetry-stream", "background-workers"],
      hypothesis:
        "Buffered telemetry drains after partition recovery without dropping availability below target.",
      blastRadiusPercent: 10,
      durationMinutes: 15,
      steadyState: { p99LatencyMs: 100, availabilityPercent: 99.99, errorRatePercent: 0.2 },
      abortConditions: [
        { metric: "availabilityPercent", operator: "<", threshold: 99.99, durationSeconds: 60 },
        { metric: "errorRatePercent", operator: ">=", threshold: 1, durationSeconds: 120 },
      ],
      rollback: ["Remove partition rule", "Scale telemetry consumers", "Replay staging queue"],
      securityReviewRequired: true,
      monitoringSignals: ["telemetry_lag_seconds", "queue_depth", "worker_replay_success"],
    },
    {
      id: "wallet-adapter-dependency-failure",
      name: "Wallet adapter dependency outage",
      type: "dependency-failure",
      services: ["wallet-adapter", "api-gateway"],
      hypothesis:
        "Wallet flows fail closed with user-visible recovery messaging and no leaked credentials.",
      blastRadiusPercent: 5,
      durationMinutes: 10,
      steadyState: { p99LatencyMs: 100, availabilityPercent: 99.99, errorRatePercent: 0.1 },
      abortConditions: [
        { metric: "securityFinding", operator: "=", threshold: true, durationSeconds: 0 },
        { metric: "errorRatePercent", operator: ">=", threshold: 1, durationSeconds: 60 },
      ],
      rollback: ["Restore dependency route", "Rotate staging wallet secrets if exposed", "Invalidate sessions"],
      securityReviewRequired: true,
      monitoringSignals: ["wallet_auth_failures", "session_error_rate", "secret_scanner_alerts"],
    },
  ],
};

export function getExperimentsForService(service: ChaosService, blueprint = STAGING_CHAOS_BLUEPRINT) {
  return blueprint.experiments.filter((experiment) => experiment.services.includes(service));
}

export function validateChaosBlueprint(blueprint: ChaosBlueprint): string[] {
  const failures: string[] = [];

  if (blueprint.p99TargetMs > 100) failures.push("Critical path P99 target must be <= 100 ms.");
  if (blueprint.availabilityTargetPercent < 99.99) failures.push("Availability target must be at least 99.99%.");
  if (blueprint.deploymentStrategy.mode !== "blue-green-with-canary") {
    failures.push("Deployment strategy must be blue-green with canary analysis.");
  }

  for (const experiment of blueprint.experiments) {
    if (!experiment.securityReviewRequired) failures.push(`${experiment.id} must require security review.`);
    if (experiment.blastRadiusPercent <= 0 || experiment.blastRadiusPercent > 10) {
      failures.push(`${experiment.id} blast radius must be between 1% and 10% for staging.`);
    }
    if (experiment.steadyState.p99LatencyMs > blueprint.p99TargetMs) {
      failures.push(`${experiment.id} exceeds the blueprint P99 latency target.`);
    }
    if (experiment.steadyState.availabilityPercent < blueprint.availabilityTargetPercent) {
      failures.push(`${experiment.id} falls below the blueprint availability target.`);
    }
    if (experiment.abortConditions.length === 0) failures.push(`${experiment.id} needs abort conditions.`);
    if (experiment.rollback.length === 0) failures.push(`${experiment.id} needs rollback steps.`);
    if (experiment.monitoringSignals.length < 3) failures.push(`${experiment.id} needs at least three monitoring signals.`);
  }

  return failures;
}
