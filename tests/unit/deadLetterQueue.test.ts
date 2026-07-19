import { describe, expect, it, vi } from "vitest";
import { DeadLetterQueue, type ProcessableMessage } from "@/services/deadLetterQueue";

const message: ProcessableMessage<{ value: number }> = {
  id: "meter-1:reading-1",
  type: "meter.reading.ingested",
  payload: { value: 42 },
  priority: "critical",
  traceId: "trace-123",
};

describe("DeadLetterQueue", () => {
  it("dead-letters a message after the configured retry budget is exhausted", async () => {
    let now = 1_000;
    const metrics = vi.fn();
    const queue = new DeadLetterQueue({ maxAttempts: 2, now: () => (now += 10), onMetric: metrics });
    const handler = vi.fn().mockRejectedValue(new Error("schema validation failed"));

    await expect(queue.process(message, handler)).resolves.toBe("retryable-failure");
    await expect(queue.process(message, handler)).resolves.toBe("dead-lettered");

    expect(handler).toHaveBeenCalledTimes(2);
    expect(queue.listDeadLetters()).toEqual([
      expect.objectContaining({
        id: message.id,
        attempts: 2,
        reason: "schema validation failed",
        retryable: true,
        traceId: "trace-123",
      }),
    ]);
    expect(queue.metrics()).toMatchObject({ queued: 1, retried: 1, deadLettered: 1 });
    expect(queue.metrics().p99CriticalPathMs).toBe(10);
    expect(metrics).toHaveBeenCalled();
  });

  it("removes retry state after successful processing", async () => {
    const queue = new DeadLetterQueue({ maxAttempts: 2 });
    await expect(queue.process(message, vi.fn().mockRejectedValue("temporary outage"))).resolves.toBe(
      "retryable-failure"
    );
    await expect(queue.process(message, vi.fn())).resolves.toBe("processed");
    await expect(queue.process(message, vi.fn().mockRejectedValue("new failure"))).resolves.toBe(
      "retryable-failure"
    );

    expect(queue.listDeadLetters()).toHaveLength(0);
  });

  it("replays and removes a dead-lettered message when remediation succeeds", async () => {
    const queue = new DeadLetterQueue<{ value: number }>({ maxAttempts: 1 });
    queue.deadLetter(message, 3, "downstream 500", true);

    await expect(queue.replayDeadLetter(message.id, vi.fn())).resolves.toBe("processed");

    expect(queue.getDeadLetter(message.id)).toBeUndefined();
    expect(queue.metrics()).toMatchObject({ queued: 0, processed: 1 });
  });

  it("keeps a dead-lettered message when replay still fails", async () => {
    const queue = new DeadLetterQueue<{ value: number }>({ maxAttempts: 1 });
    queue.deadLetter(message, 3, "downstream 500", true);

    await expect(
      queue.replayDeadLetter(message.id, vi.fn().mockRejectedValue(new Error("still down")))
    ).resolves.toBe("dead-lettered");

    expect(queue.getDeadLetter(message.id)).toEqual(
      expect.objectContaining({ attempts: 4, reason: "still down" })
    );
  });

  it("evicts the oldest dead letter when capacity is reached", () => {
    let now = 0;
    const queue = new DeadLetterQueue({ maxDeadLetters: 2, now: () => ++now });

    queue.deadLetter({ ...message, id: "a" }, 1, "a");
    queue.deadLetter({ ...message, id: "b" }, 1, "b");
    queue.deadLetter({ ...message, id: "c" }, 1, "c");

    expect(queue.listDeadLetters().map((record) => record.id)).toEqual(["b", "c"]);
    expect(queue.metrics().dropped).toBe(1);
  });
});
