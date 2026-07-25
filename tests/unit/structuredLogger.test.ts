import { describe, expect, it, beforeEach } from "vitest";
import {
  configureStructuredLogger,
  createStructuredLogRecord,
  logStructured,
  parseTraceParent,
  type StructuredLogRecord,
} from "@/utils/telemetry/structuredLogger";

describe("structuredLogger", () => {
  let records: StructuredLogRecord[];

  beforeEach(() => {
    records = [];
    configureStructuredLogger({
      serviceName: "utility-frontend-test",
      serviceVersion: "test-version",
      sink: (record) => records.push(record),
    });
  });

  it("emits OpenTelemetry-compatible severity and resource attributes", () => {
    const record = logStructured({
      severityText: "INFO",
      body: "scheduler tick completed",
      timestamp: 1_700_000_000_000,
      attributes: { "event.name": "scheduler.tick", "scheduler.job.count": 3 },
    });

    expect(records).toEqual([record]);
    expect(record).toMatchObject({
      timestamp: "2023-11-14T22:13:20.000Z",
      severityText: "INFO",
      severityNumber: 9,
      body: "scheduler tick completed",
      attributes: {
        "service.name": "utility-frontend-test",
        "service.version": "test-version",
        "telemetry.sdk.name": "utility-frontend-structured-logger",
        "event.domain": "utility.telemetry",
        "event.name": "scheduler.tick",
        "scheduler.job.count": 3,
      },
    });
  });

  it("redacts sensitive attributes before writing logs", () => {
    const record = createStructuredLogRecord({
      severityText: "WARN",
      body: "auth refresh failed",
      attributes: {
        "enduser.id": "operator-7",
        authorization: "Bearer secret",
        sessionToken: "secret-token",
        api_key: "secret-key",
      },
    });

    expect(record.attributes["enduser.id"]).toBe("operator-7");
    expect(record.attributes.authorization).toBe("[REDACTED]");
    expect(record.attributes.sessionToken).toBe("[REDACTED]");
    expect(record.attributes.api_key).toBe("[REDACTED]");
  });

  it("propagates W3C trace context fields into log records", () => {
    const trace = parseTraceParent("00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01");
    const record = createStructuredLogRecord({ severityText: "ERROR", body: "request failed", trace });

    expect(record.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(record.spanId).toBe("00f067aa0ba902b7");
    expect(record.traceFlags).toBe("01");
  });

  it("ignores malformed traceparent values", () => {
    expect(parseTraceParent("bad-value")).toEqual({});
  });
});
