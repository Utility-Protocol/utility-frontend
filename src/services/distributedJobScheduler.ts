export type DistributedJobStatus = "queued" | "leased" | "completed" | "failed";

export interface DistributedJob<TPayload = unknown> {
  id: string;
  queue: string;
  payload: TPayload;
  runAt: number;
  priority: number;
  attempts: number;
  maxAttempts: number;
  status: DistributedJobStatus;
  leaseOwner: string | null;
  leaseExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

export interface JobLease<TPayload = unknown> {
  token: string;
  workerId: string;
  expiresAt: number;
  job: DistributedJob<TPayload>;
}

export interface SchedulerMetrics {
  queued: number;
  leased: number;
  completed: number;
  failed: number;
  expiredLeases: number;
  claimLatencyMs: number;
}

export interface EnqueueJobOptions<TPayload> {
  id: string;
  queue?: string;
  payload: TPayload;
  runAt?: number;
  priority?: number;
  maxAttempts?: number;
}

export interface ClaimOptions {
  workerId: string;
  queue?: string;
  leaseMs: number;
  maxJobs?: number;
  now?: number;
}

export interface CompleteOptions {
  token: string;
  workerId: string;
  now?: number;
}

export interface FailOptions extends CompleteOptions {
  error: string;
  retryDelayMs?: number;
}

export class LeaseConflictError extends Error {
  constructor(message = "job lease is no longer owned by this worker") {
    super(message);
    this.name = "LeaseConflictError";
  }
}

const DEFAULT_QUEUE = "default";
const DEFAULT_MAX_ATTEMPTS = 3;

function cloneJob<TPayload>(job: DistributedJob<TPayload>): DistributedJob<TPayload> {
  return { ...job };
}

function isClaimable(job: DistributedJob, queue: string, now: number): boolean {
  if (job.queue !== queue || job.runAt > now) return false;
  if (job.status === "queued") return true;
  return job.status === "leased" && (job.leaseExpiresAt ?? 0) <= now;
}

export class InMemoryDistributedJobScheduler<TPayload = unknown> {
  private readonly jobs = new Map<string, DistributedJob<TPayload>>();
  private readonly leaseTokens = new Map<string, string>();
  private leaseCounter = 0;
  private expiredLeases = 0;
  private lastClaimLatencyMs = 0;

  enqueue(options: EnqueueJobOptions<TPayload>, now = Date.now()): DistributedJob<TPayload> {
    if (this.jobs.has(options.id)) {
      throw new Error(`job ${options.id} already exists`);
    }

    const job: DistributedJob<TPayload> = {
      id: options.id,
      queue: options.queue ?? DEFAULT_QUEUE,
      payload: options.payload,
      runAt: options.runAt ?? now,
      priority: options.priority ?? 0,
      attempts: 0,
      maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      status: "queued",
      leaseOwner: null,
      leaseExpiresAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(job.id, job);
    return cloneJob(job);
  }

  claim(options: ClaimOptions): JobLease<TPayload>[] {
    const startedAt = performance.now();
    const now = options.now ?? Date.now();
    const queue = options.queue ?? DEFAULT_QUEUE;
    const maxJobs = options.maxJobs ?? 1;

    const candidates = [...this.jobs.values()]
      .filter((job) => isClaimable(job, queue, now))
      .sort((a, b) => b.priority - a.priority || a.runAt - b.runAt || a.createdAt - b.createdAt)
      .slice(0, maxJobs);

    const leases = candidates.map((job) => {
      if (job.status === "leased") this.expiredLeases += 1;
      job.status = "leased";
      job.leaseOwner = options.workerId;
      job.leaseExpiresAt = now + options.leaseMs;
      job.attempts += 1;
      job.updatedAt = now;
      const token = `${options.workerId}:${++this.leaseCounter}`;
      this.leaseTokens.set(token, job.id);
      return { token, workerId: options.workerId, expiresAt: job.leaseExpiresAt, job: cloneJob(job) };
    });

    this.lastClaimLatencyMs = performance.now() - startedAt;
    return leases;
  }

  renew(token: string, workerId: string, leaseMs: number, now = Date.now()): JobLease<TPayload> {
    const job = this.requireOwnedJob(token, workerId, now);
    job.leaseExpiresAt = now + leaseMs;
    job.updatedAt = now;
    return { token, workerId, expiresAt: job.leaseExpiresAt, job: cloneJob(job) };
  }

  complete(options: CompleteOptions): DistributedJob<TPayload> {
    const now = options.now ?? Date.now();
    const job = this.requireOwnedJob(options.token, options.workerId, now);
    job.status = "completed";
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = now;
    return cloneJob(job);
  }

  fail(options: FailOptions): DistributedJob<TPayload> {
    const now = options.now ?? Date.now();
    const job = this.requireOwnedJob(options.token, options.workerId, now);
    job.lastError = options.error;
    job.leaseOwner = null;
    job.leaseExpiresAt = null;
    job.updatedAt = now;

    if (job.attempts >= job.maxAttempts) {
      job.status = "failed";
    } else {
      job.status = "queued";
      job.runAt = now + (options.retryDelayMs ?? 0);
    }
    return cloneJob(job);
  }

  metrics(): SchedulerMetrics {
    const totals = [...this.jobs.values()].reduce(
      (acc, job) => ({ ...acc, [job.status]: acc[job.status] + 1 }),
      { queued: 0, leased: 0, completed: 0, failed: 0 } as Record<DistributedJobStatus, number>
    );
    return { ...totals, expiredLeases: this.expiredLeases, claimLatencyMs: this.lastClaimLatencyMs };
  }

  snapshot(): DistributedJob<TPayload>[] {
    return [...this.jobs.values()].map(cloneJob);
  }

  private requireOwnedJob(token: string, workerId: string, now: number): DistributedJob<TPayload> {
    const jobId = this.leaseTokens.get(token);
    const job = jobId ? this.jobs.get(jobId) : undefined;
    if (!job || job.leaseOwner !== workerId || job.leaseExpiresAt === null || job.leaseExpiresAt <= now) {
      throw new LeaseConflictError();
    }
    return job;
  }
}
