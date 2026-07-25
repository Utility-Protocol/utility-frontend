/**
 * Lightweight, high-performance distributed tracing implementation conforming to OpenTelemetry standards.
 * Provides W3C Trace Context propagation, active context management, in-memory span exporting,
 * latency statistics calculation, and bulletproof resilience.
 */

export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: string; // '01' (recorded/sampled) or '00' (not recorded)
}

export type SpanStatusCode = "OK" | "ERROR" | "UNSET";

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export interface SpanEvent {
  name: string;
  time: number;
  attributes?: Record<string, unknown>;
}

export interface SpanOptions {
  parent?: Span | SpanContext;
  attributes?: Record<string, unknown>;
  startTime?: number;
}

/**
 * Lightweight representation of an OpenTelemetry Span.
 */
export class Span {
  public readonly name: string;
  public readonly context: SpanContext;
  public readonly parentSpanId: string | null = null;
  public readonly startTime: number;
  public endTime: number | null = null;
  public status: SpanStatus = { code: "UNSET" };
  public attributes: Record<string, unknown> = {};
  public events: SpanEvent[] = [];

  constructor(name: string, context: SpanContext, parentSpanId: string | null = null, options?: SpanOptions) {
    this.name = name;
    this.context = context;
    this.parentSpanId = parentSpanId;
    this.startTime = options?.startTime ?? Date.now();
    if (options?.attributes) {
      this.attributes = { ...options.attributes };
    }
  }

  public setAttribute(key: string, value: unknown): this {
    try {
      this.attributes[key] = value;
    } catch {
      // Fail-safe
    }
    return this;
  }

  public setAttributes(attributes: Record<string, unknown>): this {
    try {
      this.attributes = { ...this.attributes, ...attributes };
    } catch {
      // Fail-safe
    }
    return this;
  }

  public addEvent(name: string, attributes?: Record<string, unknown>): this {
    try {
      this.events.push({
        name,
        time: Date.now(),
        attributes,
      });
    } catch {
      // Fail-safe
    }
    return this;
  }

  public setStatus(status: SpanStatus | SpanStatusCode): this {
    try {
      if (typeof status === "string") {
        this.status = { code: status };
      } else {
        this.status = status;
      }
    } catch {
      // Fail-safe
    }
    return this;
  }

  public recordException(error: Error | string): this {
    try {
      const message = error instanceof Error ? error.message : error;
      const stack = error instanceof Error ? error.stack : undefined;
      this.setStatus({ code: "ERROR", message });
      this.addEvent("exception", {
        "exception.message": message,
        "exception.stack": stack,
        "exception.type": error instanceof Error ? error.name : "Error",
      });
    } catch {
      // Fail-safe
    }
    return this;
  }

  public end(endTime?: number): void {
    try {
      if (this.endTime !== null) return; // already ended
      this.endTime = endTime ?? Date.now();
      tracingSystem.getExporter().export(this);
    } catch {
      // Fail-safe
    }
  }

  public get duration(): number {
    if (this.endTime === null) return 0;
    return Math.max(0, this.endTime - this.startTime);
  }
}

/**
 * Base interface for span exporters.
 */
export interface SpanExporter {
  export(span: Span): void;
  shutdown(): void;
}

/**
 * Lightweight in-memory span exporter that caps memory footprint and computes latency percentiles.
 */
export class InMemorySpanExporter implements SpanExporter {
  private spans: Span[] = [];
  private droppedSpansCount = 0;

  constructor(private readonly maxBufferSize: number = 5000) {}

  public export(span: Span): void {
    if (this.spans.length >= this.maxBufferSize) {
      this.spans.shift(); // Evict oldest span
      this.droppedSpansCount++;
    }
    this.spans.push(span);
  }

  public getSpans(): Span[] {
    return [...this.spans];
  }

  public getDroppedSpansCount(): number {
    return this.droppedSpansCount;
  }

  public clear(): void {
    this.spans = [];
    this.droppedSpansCount = 0;
  }

  public shutdown(): void {
    this.clear();
  }

  /**
   * Calculates latency statistics for exported spans with the given filter.
   */
  public getStats(spanNameFilter?: string) {
    const matchingSpans = this.spans.filter(
      (s) => s.endTime !== null && (!spanNameFilter || s.name === spanNameFilter)
    );
    if (matchingSpans.length === 0) {
      return { count: 0, p50: 0, p90: 0, p99: 0, max: 0, errorRate: 0 };
    }

    const durations = matchingSpans.map((s) => s.duration).sort((a, b) => a - b);
    const count = durations.length;
    const errors = matchingSpans.filter((s) => s.status.code === "ERROR").length;

    const getPercentile = (p: number) => {
      const idx = Math.min(count - 1, Math.max(0, Math.floor((p / 100) * count)));
      return durations[idx];
    };

    return {
      count,
      p50: getPercentile(50),
      p90: getPercentile(90),
      p99: getPercentile(99),
      max: durations[count - 1],
      errorRate: errors / count,
    };
  }
}

/**
 * W3C Trace Context Propagator for distributed tracing across services.
 */
export class W3CPropagator {
  /**
   * Injects SpanContext into HTTP headers.
   */
  public inject(context: SpanContext, carrier: Record<string, string>): void {
    try {
      carrier["traceparent"] = `00-${context.traceId}-${context.spanId}-${context.traceFlags}`;
    } catch {
      // Fail-safe
    }
  }

  /**
   * Extracts SpanContext from HTTP headers.
   */
  public extract(carrier: Record<string, string | string[] | undefined>): SpanContext | undefined {
    try {
      const rawTraceParent = carrier["traceparent"];
      if (!rawTraceParent || typeof rawTraceParent !== "string") {
        return undefined;
      }

      const parts = rawTraceParent.trim().split("-");
      if (parts.length < 4) {
        return undefined;
      }

      const [version, traceId, spanId, traceFlags] = parts;
      if (version !== "00") {
        return undefined; // unsupported version
      }

      // Validate hex lengths and that they are not all zeros
      if (traceId.length !== 32 || /^[0]+$/.test(traceId)) {
        return undefined;
      }
      if (spanId.length !== 16 || /^[0]+$/.test(spanId)) {
        return undefined;
      }
      if (traceFlags.length !== 2) {
        return undefined;
      }

      return { traceId, spanId, traceFlags };
    } catch {
      return undefined;
    }
  }
}

/**
 * Global Tracing System singleton coordinating active context, tracer operations,
 * and span exports.
 */
class TracingSystem {
  private activeSpanStack: Span[] = [];
  private exporter: SpanExporter = new InMemorySpanExporter();
  private enabled = true;

  constructor() {
    try {
      const envVal = process.env.NEXT_PUBLIC_TRACING_ENABLED;
      if (envVal === "false") {
        this.enabled = false;
      }
    } catch {
      // Graceful fallback
    }
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  public setExporter(exporter: SpanExporter): void {
    this.exporter = exporter;
  }

  public getExporter(): SpanExporter {
    return this.exporter;
  }

  public getActiveSpan(): Span | undefined {
    return this.activeSpanStack[this.activeSpanStack.length - 1];
  }

  public startSpan(name: string, options?: SpanOptions): Span {
    try {
      if (!this.enabled) {
        return new Span(name, { traceId: "", spanId: "", traceFlags: "00" }, null, options);
      }

      let traceId = "";
      let parentSpanId: string | null = null;
      let traceFlags = "01";

      const parent = options?.parent ?? this.getActiveSpan();

      if (parent) {
        if (parent instanceof Span) {
          traceId = parent.context.traceId;
          parentSpanId = parent.context.spanId;
          traceFlags = parent.context.traceFlags;
        } else {
          traceId = parent.traceId;
          parentSpanId = parent.spanId;
          traceFlags = parent.traceFlags;
        }
      }

      if (!traceId) {
        traceId = this.generateId(32);
      }
      const spanId = this.generateId(16);

      const context: SpanContext = { traceId, spanId, traceFlags };
      return new Span(name, context, parentSpanId, options);
    } catch (err) {
      // Bulletproof fail-safe returns an unsampled, dummy span rather than throwing
      return new Span(name, { traceId: "00000000000000000000000000000000", spanId: "0000000000000000", traceFlags: "00" }, null);
    }
  }

  /**
   * Scoped execution helper that manages context stack.
   */
  public withSpan<T>(span: Span, fn: (span: Span) => T): T {
    if (!this.enabled) {
      return fn(span);
    }
    this.activeSpanStack.push(span);
    try {
      return fn(span);
    } finally {
      this.activeSpanStack.pop();
    }
  }

  /**
   * Scoped async execution helper that manages context stack.
   */
  public async withSpanAsync<T>(span: Span, fn: (span: Span) => Promise<T>): Promise<T> {
    if (!this.enabled) {
      return fn(span);
    }
    this.activeSpanStack.push(span);
    try {
      return await fn(span);
    } finally {
      this.activeSpanStack.pop();
    }
  }

  private generateId(length: number): string {
    const chars = "0123456789abcdef";
    let id = "";
    // Avoid crypto bias or heavy overhead by using highly optimized random generator
    for (let i = 0; i < length; i++) {
      id += chars[Math.floor(Math.random() * 16)];
    }
    // W3C Trace Context spec: traceId and spanId cannot be all zeros.
    // If they are, replace the first char with a non-zero.
    if (/^[0]+$/.test(id)) {
      id = "1" + id.substring(1);
    }
    return id;
  }
}

export const tracingSystem = new TracingSystem();
export const propagator = new W3CPropagator();
export const getTracer = () => tracingSystem;
