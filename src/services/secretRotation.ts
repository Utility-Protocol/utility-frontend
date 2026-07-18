export type SecretKind = "database" | "api-key";
export type RotationPhase = "pending" | "dual-write" | "canary" | "promoted" | "rolled-back";

export interface SecretDescriptor {
  id: string;
  kind: SecretKind;
  ownerService: string;
  activeVersion: string;
  nextVersion?: string;
  lastRotatedAt: number;
  rotationIntervalMs: number;
}

export interface RotationTelemetry {
  p99LatencyMs: number;
  availabilityPercent: number;
  errorRate: number;
  canarySuccessRate: number;
}

export interface RotationPolicy {
  maxCriticalPathP99Ms: number;
  minAvailabilityPercent: number;
  maxErrorRate: number;
  minCanarySuccessRate: number;
}

export interface RotationDecision {
  phase: RotationPhase;
  shouldPromote: boolean;
  alerts: string[];
  runbookSteps: string[];
}

export const DEFAULT_ROTATION_POLICY: RotationPolicy = {
  maxCriticalPathP99Ms: 100,
  minAvailabilityPercent: 99.99,
  maxErrorRate: 0.001,
  minCanarySuccessRate: 0.999,
};

export function isRotationDue(secret: SecretDescriptor, now = Date.now()): boolean {
  return now - secret.lastRotatedAt >= secret.rotationIntervalMs;
}

export function planSecretRotation(secret: SecretDescriptor, now = Date.now()): RotationDecision {
  const due = isRotationDue(secret, now);
  return {
    phase: due ? "dual-write" : "pending",
    shouldPromote: false,
    alerts: due ? [`${secret.id} is due for rotation`] : [],
    runbookSteps: due
      ? [
          "Create a new credential version in the secret manager without disabling the active version.",
          "Enable dual-read/dual-write clients and verify both credential versions authenticate.",
          "Start the blue-green rollout with a 5% canary before increasing traffic.",
        ]
      : ["No action required until the configured rotation interval elapses."],
  };
}

export function evaluateCanary(
  telemetry: RotationTelemetry,
  policy: RotationPolicy = DEFAULT_ROTATION_POLICY
): RotationDecision {
  const alerts: string[] = [];

  if (telemetry.p99LatencyMs >= policy.maxCriticalPathP99Ms) {
    alerts.push(`P99 latency ${telemetry.p99LatencyMs}ms breaches ${policy.maxCriticalPathP99Ms}ms target`);
  }
  if (telemetry.availabilityPercent < policy.minAvailabilityPercent) {
    alerts.push(`Availability ${telemetry.availabilityPercent}% is below ${policy.minAvailabilityPercent}% target`);
  }
  if (telemetry.errorRate > policy.maxErrorRate) {
    alerts.push(`Error rate ${telemetry.errorRate} exceeds ${policy.maxErrorRate} budget`);
  }
  if (telemetry.canarySuccessRate < policy.minCanarySuccessRate) {
    alerts.push(`Canary success rate ${telemetry.canarySuccessRate} is below ${policy.minCanarySuccessRate}`);
  }

  const shouldPromote = alerts.length === 0;

  return {
    phase: shouldPromote ? "promoted" : "rolled-back",
    shouldPromote,
    alerts,
    runbookSteps: shouldPromote
      ? [
          "Promote the green secret version to active for all services.",
          "Revoke the previous credential after connection pools have drained.",
          "Record rotation evidence and security-review approval links.",
        ]
      : [
          "Freeze canary expansion and route traffic back to the blue credential version.",
          "Keep the previous credential enabled until all clients confirm recovery.",
          "Page the owning service and security reviewers with canary telemetry.",
        ],
  };
}

export function buildRotationDashboardMetrics(secret: SecretDescriptor, telemetry: RotationTelemetry) {
  return {
    secretId: secret.id,
    kind: secret.kind,
    ownerService: secret.ownerService,
    activeVersion: secret.activeVersion,
    nextVersion: secret.nextVersion ?? null,
    millisecondsUntilDue: Math.max(0, secret.lastRotatedAt + secret.rotationIntervalMs - Date.now()),
    p99LatencyMs: telemetry.p99LatencyMs,
    availabilityPercent: telemetry.availabilityPercent,
    errorRate: telemetry.errorRate,
    canarySuccessRate: telemetry.canarySuccessRate,
  };
}
