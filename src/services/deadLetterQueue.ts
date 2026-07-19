export type MessagePriority = "critical" | "standard" | "bulk";

export interface ProcessableMessage<TPayload = unknown> {
  id: string;
  type: string;
  payload: TPayload;
  priority?: MessagePriority;
  createdAt?: number;
  traceId?: string;
}

export interface FailedMessageRecord<TPayload = unknown>
  extends ProcessableMessage<TPayload> {
  failedAt: number;
  attempts: number;
  reason: string;
  retryable: boolean;
}

export interface DeadLetterQueueMetrics {
  queued: number;
  processed: number;
  retried: number;
  deadLettered: number;
  dropped: number;
  p99CriticalPathMs: number;
}

export interface DeadLetterQueueOptions {
  maxAttempts?: number;
  maxDeadLetters?: number;
  now?: () => number;
  onMetric?: (metrics: DeadLetterQueueMetrics) => void;
}

export type MessageHandler<TPayload = unknown> = (
  message: ProcessableMessage<TPayload>
) => Promise<void> | void;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_DEAD_LETTERS = 1_000;

function errorReason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function percentile99(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.99) - 1);
  return sorted[index];
}

export class DeadLetterQueue<TPayload = unknown> {
  private readonly maxAttempts: number;
  private readonly maxDeadLetters: number;
  private readonly now: () => number;
  private readonly onMetric?: (metrics: DeadLetterQueueMetrics) => void;
  private readonly deadLetters = new Map<string, FailedMessageRecord<TPayload>>();
  private readonly attempts = new Map<string, number>();
  private readonly criticalPathDurations: number[] = [];
  private processed = 0;
  private retried = 0;
  private dropped = 0;

  constructor(options: DeadLetterQueueOptions = {}) {
    this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.maxDeadLetters = options.maxDeadLetters ?? DEFAULT_MAX_DEAD_LETTERS;
    this.now = options.now ?? Date.now;
    this.onMetric = options.onMetric;
  }

  async process(
    message: ProcessableMessage<TPayload>,
    handler: MessageHandler<TPayload>
  ): Promise<"processed" | "retryable-failure" | "dead-lettered"> {
    const startedAt = this.now();
    try {
      await handler(message);
      this.processed += 1;
      this.attempts.delete(message.id);
      this.recordDuration(message, startedAt);
      this.emitMetrics();
      return "processed";
    } catch (error) {
      this.recordDuration(message, startedAt);
      const attempts = (this.attempts.get(message.id) ?? 0) + 1;
      this.attempts.set(message.id, attempts);

      if (attempts < this.maxAttempts) {
        this.retried += 1;
        this.emitMetrics();
        return "retryable-failure";
      }

      this.deadLetter(message, attempts, errorReason(error), true);
      this.attempts.delete(message.id);
      return "dead-lettered";
    }
  }

  deadLetter(
    message: ProcessableMessage<TPayload>,
    attempts: number,
    reason: string,
    retryable = false
  ): FailedMessageRecord<TPayload> {
    if (this.deadLetters.size >= this.maxDeadLetters) {
      const oldestKey = this.deadLetters.keys().next().value as string | undefined;
      if (oldestKey) {
        this.deadLetters.delete(oldestKey);
        this.dropped += 1;
      }
    }

    const record: FailedMessageRecord<TPayload> = {
      ...message,
      createdAt: message.createdAt ?? this.now(),
      failedAt: this.now(),
      attempts,
      reason,
      retryable,
    };
    this.deadLetters.set(message.id, record);
    this.emitMetrics();
    return record;
  }

  listDeadLetters(): FailedMessageRecord<TPayload>[] {
    return [...this.deadLetters.values()].sort((a, b) => a.failedAt - b.failedAt);
  }

  getDeadLetter(id: string): FailedMessageRecord<TPayload> | undefined {
    return this.deadLetters.get(id);
  }

  removeDeadLetter(id: string): boolean {
    const removed = this.deadLetters.delete(id);
    if (removed) this.emitMetrics();
    return removed;
  }

  async replayDeadLetter(
    id: string,
    handler: MessageHandler<TPayload>
  ): Promise<"processed" | "dead-lettered" | "missing"> {
    const record = this.deadLetters.get(id);
    if (!record) return "missing";

    const startedAt = this.now();
    try {
      await handler(record);
      this.deadLetters.delete(id);
      this.processed += 1;
      this.recordDuration(record, startedAt);
      this.emitMetrics();
      return "processed";
    } catch (error) {
      this.recordDuration(record, startedAt);
      this.deadLetter(record, record.attempts + 1, errorReason(error), true);
      return "dead-lettered";
    }
  }

  metrics(): DeadLetterQueueMetrics {
    return {
      queued: this.deadLetters.size,
      processed: this.processed,
      retried: this.retried,
      deadLettered: this.deadLetters.size,
      dropped: this.dropped,
      p99CriticalPathMs: percentile99(this.criticalPathDurations),
    };
  }

  private recordDuration(message: ProcessableMessage<TPayload>, startedAt: number): void {
    if (message.priority !== "critical") return;
    this.criticalPathDurations.push(Math.max(0, this.now() - startedAt));
    if (this.criticalPathDurations.length > 256) this.criticalPathDurations.shift();
  }

  private emitMetrics(): void {
    this.onMetric?.(this.metrics());
  }
}
