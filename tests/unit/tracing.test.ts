import { describe, it, expect, beforeEach, vi } from "vitest";
import { tracingSystem, propagator, Span, getTracer, InMemorySpanExporter } from "@/utils/telemetry/tracing";
import { api } from "@/services/api";

describe("Lightweight OpenTelemetry Tracing System", () => {
  beforeEach(() => {
    tracingSystem.setEnabled(true);
    // Restore default exporter
    tracingSystem.setExporter(new InMemorySpanExporter());
  });

  describe("ID Generation", () => {
    it("should generate traceId of length 32 and spanId of length 16", () => {
      const span = tracingSystem.startSpan("test-span");
      expect(span.context.traceId).toHaveLength(32);
      expect(span.context.spanId).toHaveLength(16);
      expect(span.context.traceFlags).toBe("01");
    });

    it("should not generate all zeros for traceId or spanId", () => {
      const span = tracingSystem.startSpan("test-span");
      expect(span.context.traceId).not.toBe("00000000000000000000000000000000");
      expect(span.context.spanId).not.toBe("0000000000000000");
    });
  });

  describe("Span Lifecycle and Properties", () => {
    it("should compute duration after span ends", async () => {
      const span = tracingSystem.startSpan("duration-test", { startTime: 1000 });
      expect(span.duration).toBe(0);
      span.end(1500);
      expect(span.duration).toBe(500);
    });

    it("should record attributes, events, and exceptions", () => {
      const span = tracingSystem.startSpan("attributes-test");
      span.setAttribute("app.version", "1.0.0");
      span.setAttributes({ "user.id": 123, "session.id": "abc" });
      span.addEvent("click", { element: "btn-submit" });
      span.recordException(new Error("Database connection timeout"));

      expect(span.attributes["app.version"]).toBe("1.0.0");
      expect(span.attributes["user.id"]).toBe(123);
      expect(span.attributes["session.id"]).toBe("abc");
      expect(span.status.code).toBe("ERROR");
      expect(span.status.message).toBe("Database connection timeout");
      expect(span.events).toHaveLength(2);
      expect(span.events[0].name).toBe("click");
      expect(span.events[1].name).toBe("exception");
    });
  });

  describe("Context Management & Parent-Child Span Relationship", () => {
    it("should correctly track active span in context", () => {
      expect(tracingSystem.getActiveSpan()).toBeUndefined();
      const parentSpan = tracingSystem.startSpan("parent");

      tracingSystem.withSpan(parentSpan, () => {
        expect(tracingSystem.getActiveSpan()).toBe(parentSpan);

        const childSpan = tracingSystem.startSpan("child");
        expect(childSpan.parentSpanId).toBe(parentSpan.context.spanId);
        expect(childSpan.context.traceId).toBe(parentSpan.context.traceId);

        tracingSystem.withSpan(childSpan, () => {
          expect(tracingSystem.getActiveSpan()).toBe(childSpan);
        });

        expect(tracingSystem.getActiveSpan()).toBe(parentSpan);
      });

      expect(tracingSystem.getActiveSpan()).toBeUndefined();
    });

    it("should gracefully handle disabled tracing by returning dummy spans", () => {
      tracingSystem.setEnabled(false);
      const span = tracingSystem.startSpan("disabled-test");
      expect(span.context.traceId).toBe("");
      expect(span.context.spanId).toBe("");
      expect(span.context.traceFlags).toBe("00");

      let called = false;
      tracingSystem.withSpan(span, () => {
        called = true;
      });
      expect(called).toBe(true);
    });
  });

  describe("W3C Trace Context Propagator", () => {
    it("should inject traceparent header correctly", () => {
      const carrier: Record<string, string> = {};
      const context = {
        traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
        spanId: "00f067aa0ba902b7",
        traceFlags: "01",
      };
      propagator.inject(context, carrier);
      expect(carrier["traceparent"]).toBe("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    });

    it("should extract valid traceparent header", () => {
      const carrier = {
        traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
      };
      const context = propagator.extract(carrier);
      expect(context).toBeDefined();
      expect(context?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
      expect(context?.spanId).toBe("00f067aa0ba902b7");
      expect(context?.traceFlags).toBe("01");
    });

    it("should reject invalid traceparent headers", () => {
      const testCases = [
        {}, // missing
        { traceparent: "" }, // empty
        { traceparent: "01-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" }, // bad version
        { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7" }, // short split
        { traceparent: "00-00000000000000000000000000000000-00f067aa0ba902b7-01" }, // all-zero traceId
        { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-0000000000000000-01" }, // all-zero spanId
      ];

      for (const carrier of testCases) {
        expect(propagator.extract(carrier)).toBeUndefined();
      }
    });
  });

  describe("InMemorySpanExporter & Statistics", () => {
    it("should enforce buffer size limit and evict old spans", () => {
      const exporter = new InMemorySpanExporter(3);

      for (let i = 0; i < 5; i++) {
        const span = new Span(`span-${i}`, { traceId: "a", spanId: `b${i}`, traceFlags: "01" });
        exporter.export(span);
      }

      const spans = exporter.getSpans();
      expect(spans).toHaveLength(3);
      expect(spans[0].name).toBe("span-2");
      expect(spans[1].name).toBe("span-3");
      expect(spans[2].name).toBe("span-4");
      expect(exporter.getDroppedSpansCount()).toBe(2);
    });

    it("should compute correct statistics", () => {
      const exporter = new InMemorySpanExporter();

      const span1 = new Span("test-op", { traceId: "a", spanId: "b", traceFlags: "01" }, null, { startTime: 100 });
      span1.endTime = 200; // 100ms
      const span2 = new Span("test-op", { traceId: "c", spanId: "d", traceFlags: "01" }, null, { startTime: 100 });
      span2.endTime = 300; // 200ms
      const span3 = new Span("test-op", { traceId: "e", spanId: "f", traceFlags: "01" }, null, { startTime: 100 });
      span3.recordException("failed");
      span3.endTime = 400; // 300ms

      exporter.export(span1);
      exporter.export(span2);
      exporter.export(span3);

      const stats = exporter.getStats("test-op");
      expect(stats.count).toBe(3);
      expect(stats.p50).toBe(200);
      expect(stats.p99).toBe(300);
      expect(stats.max).toBe(300);
      expect(stats.errorRate).toBeCloseTo(0.33, 1);
    });
  });

  describe("API Integration and Request Headers Injection", () => {
    it("should inject traceparent header in api calls", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: async () => ({ status: "success" }),
      });

      // Override globalThis.fetch temporary for spy
      const origFetch = globalThis.fetch;
      globalThis.fetch = fetchSpy;

      try {
        const tracer = getTracer();
        const rootSpan = tracer.startSpan("user-action");

        await tracer.withSpanAsync(rootSpan, async () => {
          await api.get("/api/test-route");
        });

        expect(fetchSpy).toHaveBeenCalledOnce();
        const callArgs = fetchSpy.mock.calls[0];
        const headers = callArgs[1]?.headers as Record<string, string>;

        expect(headers).toBeDefined();
        expect(headers["traceparent"]).toBeDefined();
        expect(headers["traceparent"]).toContain(rootSpan.context.traceId);
      } finally {
        globalThis.fetch = origFetch;
      }
    });
  });
});
