/**
 * Kafka consumer-lag policy helpers shared by operations dashboards and
 * auto-scaling controllers. The functions are deterministic and side-effect
 * free so they can be reused by backend adapters, UI previews, and runbooks.
 */

export type LagSeverity = "healthy" | "watch" | "critical";

export interface KafkaConsumerLagSample {
  /** Consumer-group identifier. */
  groupId: string;
  /** Kafka topic name. */
  topic: string;
  /** Partition id inside the topic. */
  partition: number;
  /** Last committed offset for the consumer group. */
  committedOffset: number;
  /** Latest broker high-watermark offset. */
  highWatermark: number;
  /** Epoch millisecond timestamp when the sample was collected. */
  sampledAt: number;
}

export interface LagPolicy {
  /** Lag that should page operators and trigger aggressive scale-out. */
  criticalLag: number;
  /** Lag that should warn operators and allow moderate scale-out. */
  warningLag: number;
  /** Highest allowed lag age before the sample is considered stale. */
  staleAfterMs: number;
  /** Minimum replicas that the consumer group should keep warm. */
  minReplicas: number;
  /** Maximum replicas permitted by capacity and cost guardrails. */
  maxReplicas: number;
  /** Approximate backlog that a single replica can drain during the SLO window. */
  lagPerReplica: number;
  /** Replica count change allowed in a single evaluation tick. */
  maxStep: number;
}

export interface ConsumerGroupLagSummary {
  groupId: string;
  totalLag: number;
  maxPartitionLag: number;
  partitions: number;
  severity: LagSeverity;
  stale: boolean;
  sampledAt: number;
}

export interface ScalingRecommendation {
  groupId: string;
  currentReplicas: number;
  desiredReplicas: number;
  reason: string;
  severity: LagSeverity;
}

export const DEFAULT_LAG_POLICY: LagPolicy = {
  criticalLag: 50_000,
  warningLag: 10_000,
  staleAfterMs: 120_000,
  minReplicas: 2,
  maxReplicas: 30,
  lagPerReplica: 5_000,
  maxStep: 4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function partitionLag(sample: KafkaConsumerLagSample): number {
  if (!Number.isFinite(sample.committedOffset) || !Number.isFinite(sample.highWatermark)) {
    throw new Error("Kafka offsets must be finite numbers");
  }

  return Math.max(0, Math.floor(sample.highWatermark - sample.committedOffset));
}

export function summarizeConsumerLag(
  samples: KafkaConsumerLagSample[],
  policy: LagPolicy = DEFAULT_LAG_POLICY,
  now: number = Date.now()
): ConsumerGroupLagSummary[] {
  const byGroup = new Map<string, KafkaConsumerLagSample[]>();
  for (const sample of samples) {
    const groupSamples = byGroup.get(sample.groupId) ?? [];
    groupSamples.push(sample);
    byGroup.set(sample.groupId, groupSamples);
  }

  return Array.from(byGroup.entries())
    .map(([groupId, groupSamples]) => {
      const lags = groupSamples.map(partitionLag);
      const totalLag = lags.reduce((sum, lag) => sum + lag, 0);
      const maxPartitionLag = Math.max(...lags, 0);
      const sampledAt = Math.max(...groupSamples.map((sample) => sample.sampledAt));
      const stale = now - sampledAt > policy.staleAfterMs;
      const severity: LagSeverity = stale || totalLag >= policy.criticalLag
        ? "critical"
        : totalLag >= policy.warningLag
          ? "watch"
          : "healthy";

      return {
        groupId,
        totalLag,
        maxPartitionLag,
        partitions: groupSamples.length,
        severity,
        stale,
        sampledAt,
      };
    })
    .sort((a, b) => b.totalLag - a.totalLag || a.groupId.localeCompare(b.groupId));
}

export function recommendConsumerReplicas(
  summary: ConsumerGroupLagSummary,
  currentReplicas: number,
  policy: LagPolicy = DEFAULT_LAG_POLICY
): ScalingRecommendation {
  if (policy.lagPerReplica <= 0) throw new Error("lagPerReplica must be positive");
  const current = clamp(Math.round(currentReplicas), policy.minReplicas, policy.maxReplicas);
  const backlogReplicas = Math.ceil(summary.totalLag / policy.lagPerReplica);
  const target = clamp(Math.max(policy.minReplicas, backlogReplicas), policy.minReplicas, policy.maxReplicas);
  const limitedTarget = target > current
    ? Math.min(target, current + policy.maxStep)
    : Math.max(target, current - policy.maxStep);

  return {
    groupId: summary.groupId,
    currentReplicas: current,
    desiredReplicas: limitedTarget,
    severity: summary.severity,
    reason: summary.stale
      ? "lag metrics are stale; hold within guardrails while paging operators"
      : limitedTarget > current
        ? `scale out to drain ${summary.totalLag} queued messages`
        : limitedTarget < current
          ? `scale in after lag recovered to ${summary.totalLag}`
          : `keep ${current} replicas for ${summary.totalLag} queued messages`,
  };
}
