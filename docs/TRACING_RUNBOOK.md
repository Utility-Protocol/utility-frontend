# Operations Runbook: Distributed Tracing & Context Propagation

This runbook is for on-call engineers to diagnose, mitigate, and resolve issues related to the distributed tracing and trace context propagation subsystem.

---

## 1. Context Propagation Overview & Diagnostic Commands

Distributed tracing works by appending W3C Trace Context headers to outgoing REST API calls:
- `traceparent`: `00-<32-hex-trace-id>-<16-hex-span-id>-<02-hex-flags>`

To verify context propagation is working correctly across microservices, use curl to inspect response headers or inspect incoming request logs.

### Command Line Verification (HTTP curl check)
Verify that trace headers are being forwarded to downstream endpoints:

```bash
# Execute request against external resource API with manual trace context headers
curl -v -H "traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" \
     http://localhost:4000/api/resources/schema
```

Look for the matching `traceparent` headers logged on the server-side to confirm successful propagation.

---

## 2. Standard Triage Playbooks

### Playbook A: P99 Latency SLA Exceeded (> 100ms on Critical Path)

**Symptom**: Prometheus triggers a `CriticalPathLatencySLAExceeded` alert.

1. **Isolate Tracing Overhead**:
   Check the `tracing_span_creation_latency_us` metric in Grafana.
   - If tracing overhead is **< 1ms**, the latency is caused by downstream application/network bottlenecks, not the tracing system. Proceed to standard service triage.
   - If tracing overhead is **> 5ms**, tracing context manager is experiencing thread-contention or a CPU bottleneck.
2. **Mitigation**:
   - Temporarily disable tracing collection by setting the environment variable `NEXT_PUBLIC_TRACING_ENABLED=false` (this disables span creation but preserves header propagation to prevent breaking context downstream).
   - Trigger a rolling restart of the frontend services to clear any bad execution states.

---

### Playbook B: High Rate of Dropped Spans (`TracingExporterDroppedSpans`)

**Symptom**: Exporter buffers are overflowing and dropping span packets.

1. **Analyze Exporter Backlog**:
   Check if the OpenTelemetry collector endpoint is reachable and responding. Run standard network ping checks:
   ```bash
   curl -I http://otel-collector.internal:4318/v1/traces
   ```
2. **Increase Buffer Size (Temporary Remediation)**:
   If the collector is experiencing a temporary backlog, increase the exporter buffer size limit in the service config (e.g., `NEXT_PUBLIC_TRACING_MAX_BUFFER_SIZE=10000`) to hold more spans during network dips.
3. **Verify Connection Pool / Thread Contention**:
   If the collector is healthy but dropping spans, check for client network contention or socket exhaustion in the local environment.

---

### Playbook C: Broken Context / Propagation Errors (`TraceContextPropagationFailures`)

**Symptom**: Downstream services report "Missing trace context" or trace parenting chains are disconnected.

1. **Inspect `traceparent` header format**:
   Check the application logs to see if there are any invalid trace ID formats:
   ```bash
   # Look for invalid or trace ID error patterns
   grep -rn "invalid traceparent format" /var/log/utility-protocol/
   ```
2. **Verify Header Capitalization and CORS**:
   Some proxies or API Gateways strip custom headers or lowercase them incorrectly. Ensure the `traceparent` header is allowed in the CORS configuration:
   `Access-Control-Allow-Headers: traceparent, tracestate, Authorization, Content-Type`
