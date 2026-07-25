import { describe, expect, it } from "vitest";
import { InMemoryDistributedJobScheduler, LeaseConflictError } from "@/services/distributedJobScheduler";

describe("InMemoryDistributedJobScheduler", () => {
  it("claims due jobs once with a lease", () => {
    const scheduler = new InMemoryDistributedJobScheduler();
    scheduler.enqueue({ id: "job-a", payload: { meter: "m1" } }, 1_000);

    const first = scheduler.claim({ workerId: "worker-a", leaseMs: 500, now: 1_000 });
    const second = scheduler.claim({ workerId: "worker-b", leaseMs: 500, now: 1_001 });

    expect(first).toHaveLength(1);
    expect(first[0].job.leaseOwner).toBe("worker-a");
    expect(second).toHaveLength(0);
  });

  it("allows another worker to reclaim an expired lease", () => {
    const scheduler = new InMemoryDistributedJobScheduler();
    scheduler.enqueue({ id: "job-a", payload: null }, 1_000);
    scheduler.claim({ workerId: "worker-a", leaseMs: 100, now: 1_000 });

    const reclaimed = scheduler.claim({ workerId: "worker-b", leaseMs: 100, now: 1_101 });

    expect(reclaimed).toHaveLength(1);
    expect(reclaimed[0].job.leaseOwner).toBe("worker-b");
    expect(scheduler.metrics().expiredLeases).toBe(1);
  });

  it("rejects stale completion after lease expiry", () => {
    const scheduler = new InMemoryDistributedJobScheduler();
    scheduler.enqueue({ id: "job-a", payload: null }, 1_000);
    const [lease] = scheduler.claim({ workerId: "worker-a", leaseMs: 100, now: 1_000 });

    expect(() => scheduler.complete({ token: lease.token, workerId: "worker-a", now: 1_101 })).toThrow(LeaseConflictError);
  });

  it("orders claims by priority then run time", () => {
    const scheduler = new InMemoryDistributedJobScheduler();
    scheduler.enqueue({ id: "low", payload: null, priority: 1, runAt: 900 }, 100);
    scheduler.enqueue({ id: "high", payload: null, priority: 10, runAt: 950 }, 100);

    const [lease] = scheduler.claim({ workerId: "worker-a", leaseMs: 100, maxJobs: 1, now: 1_000 });

    expect(lease.job.id).toBe("high");
  });

  it("retries failed jobs until max attempts", () => {
    const scheduler = new InMemoryDistributedJobScheduler();
    scheduler.enqueue({ id: "job-a", payload: null, maxAttempts: 2 }, 1_000);
    const [first] = scheduler.claim({ workerId: "worker-a", leaseMs: 100, now: 1_000 });
    scheduler.fail({ token: first.token, workerId: "worker-a", error: "timeout", retryDelayMs: 50, now: 1_010 });

    const [second] = scheduler.claim({ workerId: "worker-b", leaseMs: 100, now: 1_060 });
    const failed = scheduler.fail({ token: second.token, workerId: "worker-b", error: "timeout", now: 1_070 });

    expect(failed.status).toBe("failed");
    expect(scheduler.metrics().failed).toBe(1);
  });
});
