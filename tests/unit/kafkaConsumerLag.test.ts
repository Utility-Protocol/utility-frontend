import { describe, expect, it } from "vitest";
import {
  DEFAULT_LAG_POLICY,
  partitionLag,
  recommendConsumerReplicas,
  summarizeConsumerLag,
  type KafkaConsumerLagSample,
} from "@/utils/kafkaConsumerLag";

const baseSample: KafkaConsumerLagSample = {
  groupId: "billing-writer",
  topic: "meter-readings",
  partition: 0,
  committedOffset: 100,
  highWatermark: 150,
  sampledAt: 1_000,
};

describe("partitionLag", () => {
  it("never reports negative lag when offsets race", () => {
    expect(partitionLag({ ...baseSample, committedOffset: 200, highWatermark: 150 })).toBe(0);
  });

  it("rejects non-finite offsets", () => {
    expect(() => partitionLag({ ...baseSample, committedOffset: Number.NaN })).toThrow(
      "Kafka offsets must be finite numbers"
    );
  });
});

describe("summarizeConsumerLag", () => {
  it("aggregates lag by consumer group and sorts the largest backlog first", () => {
    const summaries = summarizeConsumerLag([
      baseSample,
      { ...baseSample, partition: 1, committedOffset: 0, highWatermark: 25 },
      { ...baseSample, groupId: "notifications", committedOffset: 10, highWatermark: 15 },
    ], DEFAULT_LAG_POLICY, 1_000);

    expect(summaries).toEqual([
      expect.objectContaining({
        groupId: "billing-writer",
        totalLag: 75,
        maxPartitionLag: 50,
        partitions: 2,
        severity: "healthy",
        stale: false,
      }),
      expect.objectContaining({ groupId: "notifications", totalLag: 5 }),
    ]);
  });

  it("marks stale metrics as critical even with low lag", () => {
    const [summary] = summarizeConsumerLag([baseSample], DEFAULT_LAG_POLICY, 125_001);

    expect(summary.severity).toBe("critical");
    expect(summary.stale).toBe(true);
  });
});

describe("recommendConsumerReplicas", () => {
  it("steps scale-out decisions instead of jumping straight to the target", () => {
    const [summary] = summarizeConsumerLag([
      { ...baseSample, committedOffset: 0, highWatermark: 80_000 },
    ], DEFAULT_LAG_POLICY, 1_000);

    expect(recommendConsumerReplicas(summary, 3)).toEqual({
      groupId: "billing-writer",
      currentReplicas: 3,
      desiredReplicas: 7,
      severity: "critical",
      reason: "scale out to drain 80000 queued messages",
    });
  });

  it("scales in only after lag has recovered", () => {
    const [summary] = summarizeConsumerLag([baseSample], DEFAULT_LAG_POLICY, 1_000);

    expect(recommendConsumerReplicas(summary, 12).desiredReplicas).toBe(8);
  });
});
