export type LogSeverity = "DEBUG" | "INFO" | "WARN" | "ERROR" | "FATAL";

export interface TraceContext {
  traceId?: string;
  spanId?: string;
  traceFlags?: string;
}

export interface LogAttributes {
  [key: string]: string | number | boolean | null | undefined;
}

export interface StructuredLogInput {
  severityText: LogSeverity;
  body: string;
  attributes?: LogAttributes;
  trace?: TraceContext;
  timestamp?: number;
}

export interface StructuredLogRecord {
  timestamp: string;
  observedTimestamp: string;
  severityText: LogSeverity;
  severityNumber: number;
  body: string;
  traceId?: string;
  spanId?: string;
  traceFlags?: string;
  attributes: Record<string, string | number | boolean>;
}

type LogSink = (record: StructuredLogRecord) => void;

const SEVERITY_NUMBER: Record<LogSeverity, number> = {
  DEBUG: 5,
  INFO: 9,
  WARN: 13,
  ERROR: 17,
  FATAL: 21,
};

const REDACTED = "[REDACTED]";
const SENSITIVE_ATTRIBUTE_PATTERN = /(authorization|token|secret|password|cookie|api[-_]?key|session)/i;
const TRACEPARENT_PATTERN = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i;

let serviceName = process.env.NEXT_PUBLIC_OTEL_SERVICE_NAME ?? "utility-frontend";
let serviceVersion = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0";
let logSink: LogSink = (record) => {
  const line = JSON.stringify(record);
  if (record.severityText === "ERROR" || record.severityText === "FATAL") {
    console.error(line);
    return;
  }
  if (record.severityText === "WARN") {
    console.warn(line);
    return;
  }
  console.warn(line);
};

export function configureStructuredLogger(options: {
  serviceName?: string;
  serviceVersion?: string;
  sink?: LogSink;
}): void {
  if (options.serviceName) {
    serviceName = options.serviceName;
  }
  if (options.serviceVersion) {
    serviceVersion = options.serviceVersion;
  }
  if (options.sink) {
    logSink = options.sink;
  }
}

export function parseTraceParent(traceparent: string | null | undefined): TraceContext {
  if (!traceparent) {
    return {};
  }

  const match = TRACEPARENT_PATTERN.exec(traceparent.trim());
  if (!match) {
    return {};
  }

  return {
    traceId: match[1].toLowerCase(),
    spanId: match[2].toLowerCase(),
    traceFlags: match[3].toLowerCase(),
  };
}

export function createStructuredLogRecord(input: StructuredLogInput): StructuredLogRecord {
  const timestamp = new Date(input.timestamp ?? Date.now()).toISOString();
  const attributes = sanitizeAttributes({
    "service.name": serviceName,
    "service.version": serviceVersion,
    "telemetry.sdk.name": "utility-frontend-structured-logger",
    "event.domain": "utility.telemetry",
    ...input.attributes,
  });

  return {
    timestamp,
    observedTimestamp: new Date().toISOString(),
    severityText: input.severityText,
    severityNumber: SEVERITY_NUMBER[input.severityText],
    body: input.body,
    ...compactTrace(input.trace),
    attributes,
  };
}

export function logStructured(input: StructuredLogInput): StructuredLogRecord {
  const record = createStructuredLogRecord(input);
  logSink(record);
  return record;
}

export const logger = {
  debug: (body: string, attributes?: LogAttributes, trace?: TraceContext) =>
    logStructured({ severityText: "DEBUG", body, attributes, trace }),
  info: (body: string, attributes?: LogAttributes, trace?: TraceContext) =>
    logStructured({ severityText: "INFO", body, attributes, trace }),
  warn: (body: string, attributes?: LogAttributes, trace?: TraceContext) =>
    logStructured({ severityText: "WARN", body, attributes, trace }),
  error: (body: string, attributes?: LogAttributes, trace?: TraceContext) =>
    logStructured({ severityText: "ERROR", body, attributes, trace }),
  fatal: (body: string, attributes?: LogAttributes, trace?: TraceContext) =>
    logStructured({ severityText: "FATAL", body, attributes, trace }),
};

function sanitizeAttributes(attributes: LogAttributes): Record<string, string | number | boolean> {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([, value]) => value !== null && value !== undefined)
      .map(([key, value]) => [key, SENSITIVE_ATTRIBUTE_PATTERN.test(key) ? REDACTED : value])
  ) as Record<string, string | number | boolean>;
}

function compactTrace(trace?: TraceContext): TraceContext {
  if (!trace?.traceId || !trace.spanId) {
    return {};
  }
  return {
    traceId: trace.traceId,
    spanId: trace.spanId,
    ...(trace.traceFlags ? { traceFlags: trace.traceFlags } : {}),
  };
}
