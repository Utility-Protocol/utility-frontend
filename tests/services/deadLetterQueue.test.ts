import { describe, it, expect, beforeEach, vi } from "vitest";
import { DeadLetterQueue } from "@/services/deadLetterQueue";

describe("DeadLetterQueue", () => {
  let dlq: DeadLetterQueue;

  beforeEach(() => {
    dlq = new DeadLetterQueue(3); // Small limit for testing
  });

  it("should enqueue a message and update metrics", () => {
    const id = dlq.enqueue("test-source", { foo: "bar" }, "Test error");
    
    expect(id).toBeDefined();
    
    const metrics = dlq.getMetrics();
    expect(metrics.totalEnqueued).toBe(1);
    expect(metrics.currentSize).toBe(1);
    
    const messages = dlq.peek();
    expect(messages.length).toBe(1);
    expect(messages[0].id).toBe(id);
    expect(messages[0].source).toBe("test-source");
    expect(messages[0].error).toBe("Test error");
  });

  it("should dequeue a message", () => {
    dlq.enqueue("src1", "payload1");
    dlq.enqueue("src2", "payload2");
    
    const msg = dlq.dequeue();
    expect(msg).toBeDefined();
    expect(msg?.source).toBe("src1"); // FIFO
    
    const metrics = dlq.getMetrics();
    expect(metrics.totalDequeued).toBe(1);
    expect(metrics.currentSize).toBe(1);
  });

  it("should return undefined when dequeueing an empty queue", () => {
    const msg = dlq.dequeue();
    expect(msg).toBeUndefined();
  });

  it("should drop the oldest message when exceeding maxLimit", () => {
    dlq.enqueue("src1", 1);
    dlq.enqueue("src2", 2);
    dlq.enqueue("src3", 3);
    
    // Now it's full (limit is 3)
    expect(dlq.getMetrics().currentSize).toBe(3);
    
    dlq.enqueue("src4", 4); // Should drop src1
    
    expect(dlq.getMetrics().currentSize).toBe(3);
    
    const messages = dlq.peek();
    expect(messages.length).toBe(3);
    expect(messages[0].source).toBe("src2");
    expect(messages[1].source).toBe("src3");
    expect(messages[2].source).toBe("src4");
  });

  it("should remove a specific message by id", () => {
    const id = dlq.enqueue("src1", 1);
    dlq.enqueue("src2", 2);
    
    const removed = dlq.remove(id);
    expect(removed).toBe(true);
    
    const metrics = dlq.getMetrics();
    expect(metrics.totalRemoved).toBe(1);
    expect(metrics.currentSize).toBe(1);
    
    const messages = dlq.peek();
    expect(messages.length).toBe(1);
    expect(messages[0].source).toBe("src2");
  });

  it("should notify subscribers when messages change", () => {
    const listener = vi.fn();
    const unsubscribe = dlq.subscribe(listener);
    
    dlq.enqueue("src1", 1);
    expect(listener).toHaveBeenCalledTimes(1);
    
    const id = dlq.enqueue("src2", 2);
    expect(listener).toHaveBeenCalledTimes(2);
    
    dlq.remove(id);
    expect(listener).toHaveBeenCalledTimes(3);
    
    dlq.dequeue();
    expect(listener).toHaveBeenCalledTimes(4);
    
    unsubscribe();
    dlq.enqueue("src3", 3);
    expect(listener).toHaveBeenCalledTimes(4); // Should not increase
  });

  it("should enforce < 100ms P99 performance for enqueue (synthetic test)", () => {
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      dlq.enqueue("perf-test", i);
    }
    const end = performance.now();
    
    // 1000 operations should take less than 100ms total
    expect(end - start).toBeLessThan(100);
  });
});
