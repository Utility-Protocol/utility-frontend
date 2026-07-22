# Solution Architecture: Distributed Tracing with OpenTelemetry

This document outlines the distributed tracing architecture and design for the system. It describes how trace contexts propagate across services, ensures compatibility with OpenTelemetry (OTel) standards, and meets the strict technical bounds for latency, uptime, and security.

---

## 1. Problem Statement & Scope

As distributed systems grow, pinpointing performance bottlenecks, request flows, and failures across service boundaries becomes highly complex. Distributed tracing solves this by tracking the path of a request as it propagates through various microservices and boundaries (such as REST API calls, WebSockets, and asynchronous worker tasks).

This implementation provides:
- **Lightweight Trace Context Tracking**: Fully compatible with OpenTelemetry APIs but with minimal dependency footprint to ensure client performance.
- **Trace Context Propagation**: Compliance with the **W3C Trace Context Specification** to pass trace context across network boundaries.
- **System-wide Integration**: Affecting REST APIs (`api.ts`), Proof of Reserve processes (`proofOfReserve.ts`), Export pipelines (`exportPipeline.ts`), and other critical paths.
- **Extreme Performance**: Ensuring overhead is virtually zero (< 1ms per span operation) to guarantee critical path P99 latency remains `< 100ms`.
- **99.99% Uptime Resilience**: Built-in graceful degradation and isolated in-memory caching to avoid any single point of failure (SPOF).

---

## 2. Distributed Tracing Concepts & W3C Specification

Distributed tracing relies on a few fundamental abstractions:
1. **Trace**: Represents the end-to-end journey of a transaction or request. It is identified by a unique `TraceID`.
2. **Span**: The fundamental unit of work (e.g., an HTTP request, a database query, or a client calculation). Every span has a `SpanID`, a `TraceID`, a start time, duration, and parent span reference.
3. **Trace Context**: The minimal set of metadata required to propagate tracing across boundaries.

### W3C Trace Context Propagation

To propagate traces across network boundaries, we use HTTP headers specified by the W3C Trace Context specification:

1. **`traceparent`**:
   Format: `version-traceId-parentId-traceFlags` (e.g., `00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01`)
   - **`version`** (2 hex chars): `00` (current W3C version).
   - **`traceId`** (32 hex chars): A unique identifier for the entire trace. Cannot be all zeros.
   - **`parentId` / `spanId`** (16 hex chars): The ID of the parent span. Cannot be all zeros.
   - **`traceFlags`** (2 hex chars): Flags indicating trace options. `01` means the trace is recorded/sampled, `00` means not recorded/sampled.

2. **`tracestate`**:
   Contains vendor-specific metadata represented as comma-separated key-value pairs (e.g., `congo=t61rcWkgMzE,rojo=00f067aa0ba902b7`).

---

## 3. High-Level Architecture

The following diagram illustrates how trace context flows from the client frontend to backend API services:

```
+------------------------------------------------------------------------+
|                            Browser Client                              |
|                                                                        |
|  +--------------------+      withSpan()      +----------------------+  |
|  |   Component Flow   | -------------------> |     Tracer API       |  |
|  +--------------------+                      +----------------------+  |
|            |                                            |              |
|            | Traces action                              v              |
|            v                                    +------------------+   |
|  +--------------------+                         |  Active Context  |   |
|  |     api.request()  | <---------------------- |     Manager      |   |
|  +--------------------+  reads traceparent      +------------------+   |
|            |                                                           |
+------------|-----------------------------------------------------------+
             |
             | HTTP Request (adds "traceparent: 00-traceid-spanid-01")
             v
+------------------------------------------------------------------------+
|                             API Service                                |
|                                                                        |
|            +--------------------------------------------+              |
|            | Extractor / W3C Propagator                 |              |
|            | Parses traceparent & recreates trace context |            |
|            +--------------------------------------------+              |
|                                  |                                     |
|                                  v                                     |
|            +--------------------------------------------+              |
|            | Spawns Server-side Spans                   |              |
|            +--------------------------------------------+              |
+------------------------------------------------------------------------+
```

---

## 4. Performance & Availability Safeguards

### 4.1. Performance (P99 Target: < 100ms)
Distributed tracing must not add overhead that breaches the `< 100ms` critical path requirement. To achieve this, the tracing logic uses the following designs:
- **No Heavy External SDKs**: External SDKs add kilobytes to the JS bundle and initialize several background microtasks. We use a zero-dependency, highly optimized custom tracing logic that compiles down to standard ES code.
- **Fast Identifier Generation**: Random ID generation uses highly performant bitwise masks over standard pseudo-random number generators or `crypto.getRandomValues` falling back to custom rapid random generators.
- **Time Complexity O(1)**: Context lookups, context switching, and span creations are $O(1)$ operations using stack arrays.
- **Zero-Block Async Boundaries**: Writing to the span exporter is asynchronous and never blocks the client execution thread.

### 4.2. Availability & Reliability (99.99% Uptime Target)
Telemetry systems must be secondary to main application functions. Tracing should never impact application uptime:
- **Fail-safe Defensiveness**: Any failure in the tracing subsystem is wrapped in `try-catch` blocks, ensuring that failures in starting or ending a span never crash the client application.
- **Isolated Buffers**: Spans are recorded into a strictly ring-buffered in-memory exporter with an explicit maximum capacity (e.g., 5,000 spans). This prevents memory leaks and Out-of-Memory (OOM) errors.
- **Graceful Network Degradation**: If an external tracing collector or exporter endpoint goes offline, headers are still propagated seamlessly, but outgoing span delivery degrades gracefully without clogging memory.

---

## 5. Security & Compliance

To pass security review, tracing implements:
- **PII Redaction**: Trace attributes are automatically filtered. Any URL parameters, headers (such as `Authorization` tokens), or requests containing personal identifier keys are completely redacted or excluded.
- **Safe HTML/DOM logging**: Spans do not touch UI rendering paths directly unless passing through sanitized react components, avoiding any XSS vectors.
- **No Code Injection / Safe Eval**: No `eval` or dynamic code compiling is used for metadata transformations.
