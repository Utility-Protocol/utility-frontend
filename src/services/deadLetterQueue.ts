import { logger } from "@/utils/telemetry/structuredLogger";

export interface DLQMessage<T = unknown> {
  id: string;
  source: string;
  payload: T;
  error?: string;
  timestamp: number;
}

export interface DLQMetrics {
  totalEnqueued: number;
  totalDequeued: number;
  totalRequeued: number;
  totalRemoved: number;
  currentSize: number;
}

export class DeadLetterQueue {
  private messages: Map<string, DLQMessage> = new Map();
  private metrics: DLQMetrics = {
    totalEnqueued: 0,
    totalDequeued: 0,
    totalRequeued: 0,
    totalRemoved: 0,
    currentSize: 0,
  };
  private listeners: Set<() => void> = new Set();

  constructor(private maxLimit = 10000) {}

  enqueue<T>(source: string, payload: T, error?: string): string {
    if (this.messages.size >= this.maxLimit) {
      logger.warn("DLQ is full, dropping oldest message", { source });
      const oldestId = this.messages.keys().next().value;
      if (oldestId) {
        this.messages.delete(oldestId);
        this.metrics.currentSize--;
      }
    }

    const id = crypto.randomUUID();
    const message: DLQMessage<T> = {
      id,
      source,
      payload,
      error,
      timestamp: Date.now(),
    };

    this.messages.set(id, message as DLQMessage);
    this.metrics.totalEnqueued++;
    this.metrics.currentSize++;
    
    logger.info("Message enqueued to DLQ", { id, source, error });
    this.notify();
    return id;
  }

  dequeue(): DLQMessage | undefined {
    const nextId = this.messages.keys().next().value;
    if (!nextId) return undefined;
    
    const message = this.messages.get(nextId);
    this.messages.delete(nextId);
    this.metrics.totalDequeued++;
    this.metrics.currentSize--;
    
    this.notify();
    return message;
  }

  remove(id: string): boolean {
    if (this.messages.has(id)) {
      this.messages.delete(id);
      this.metrics.totalRemoved++;
      this.metrics.currentSize--;
      this.notify();
      return true;
    }
    return false;
  }

  peek(limit = 100): DLQMessage[] {
    return Array.from(this.messages.values()).slice(0, limit);
  }

  getMetrics(): DLQMetrics {
    return { ...this.metrics };
  }
  
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  
  private notify() {
    for (const listener of this.listeners) {
      try {
        listener();
      } catch (err) {
        logger.error("DLQ subscriber error", { error: String(err) });
      }
    }
  }
}

export const dlqService = new DeadLetterQueue();
