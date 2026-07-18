# Tracing Monitoring, Alerting, and Dashboards

This document details the configuration and design of the monitoring dashboards, alerting thresholds, and telemetry metrics for tracing performance and availability.

---

## 1. Core Telemetry Metrics

To monitor tracing performance and system health, we gather the following metrics from the client and services:

| Metric Name | Type | Description | Alerting Threshold |
|-------------|------|-------------|--------------------|
| `tracing_span_creation_latency_us` | Histogram | Time (in microseconds) to start a span. | P99 > 1ms (1000us) |
| `tracing_active_spans_count` | Gauge | Count of concurrent active spans in context. | > 50 spans (potential leak) |
| `tracing_exporter_dropped_spans_total` | Counter | Total spans dropped due to exporter buffer overflow. | > 100/min |
| `tracing_context_propagation_errors_total`| Counter | Failed traceparent header parses or extractions. | > 0 |
| `http_client_request_duration_ms` | Histogram | HTTP request latency with active trace context. | P99 > 100ms |

---

## 2. Grafana Dashboard Layout

Our dashboard provides high-visibility insights into tracing sanity and request flows. Below is the structure of the Grafana dashboard JSON config.

### Dashboard Variables:
- `$environment`: e.g. `production`, `canary`, `staging`
- `$service`: Affected service (e.g., `utility-frontend`, `webrtc-mesh`, `proof-of-reserve`)

### Row 1: Health & Performance (High Level KPI)
1. **Tracing Overhead (Gauge)**: Shows average overhead of tracing in microseconds.
2. **Context Propagation Rate (Stat)**: Percentage of successful trace context propagations (Target: 100%).
3. **P99 Request Latency (Stat)**: Ensures P99 for critical paths remains `< 100ms`.

### Row 2: Latency & Traffic Heatmaps
1. **Request Duration (Heatmap)**: Latency distribution of tracked client-side operations.
2. **Tracing Overhead Distribution (Histogram)**: Distribution of span creation/end times.

### Row 3: Operational Capacity & Safety
1. **Buffer Usage / Memory Footprint (Gauge & Line)**: Memory footprint of the in-memory span exporter.
2. **Error & Exception Rates (Line)**: Exception events captured in client spans over time.

---

## 3. Prometheus Alerting Rules

Below are the alerting rules (YAML configuration) deployed in Prometheus to monitor the distributed tracing subsystem:

```yaml
groups:
  - name: TracingSubsystemAlerts
    rules:
      # Alert when tracing starts affecting transaction performance
      - alert: TracingOverheadHigh
        expr: histogram_quantile(0.99, sum(rate(tracing_span_creation_latency_us_bucket[5m])) by (le)) > 2000
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Tracing overhead is high (P99 > 2ms)"
          description: "Distributed tracing is adding high overhead in client paths. Current P99 is {{ $value }}us."

      # Alert if trace context propagation starts failing
      - alert: TraceContextPropagationFailures
        expr: rate(tracing_context_propagation_errors_total[5m]) > 0.5
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Trace context propagation is failing"
          description: "Service tracing context has failed to propagate or parse headers correctly. Action is required."

      # Alert when critical path exceeds P99 SLA
      - alert: CriticalPathLatencySLAExceeded
        expr: histogram_quantile(0.99, sum(rate(http_client_request_duration_ms_bucket[5m])) by (le)) > 100
        for: 1m
        labels:
          severity: critical
        annotations:
          summary: "Critical path latency SLA exceeded (P99 > 100ms)"
          description: "P99 latency of critical client paths has exceeded the 100ms SLA. Current value is {{ $value }}ms."

      # Alert if tracing buffer is dropping spans (high memory pressure / network backlog)
      - alert: TracingExporterDroppedSpans
        expr: rate(tracing_exporter_dropped_spans_total[5m]) > 10
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "Tracing exporter dropping spans"
          description: "Spans are being dropped due to exporter buffer overflow. The exporter backend might be overloaded."
```

---

## 4. Alert Routing & On-Call Playbook

- **Critical Alerts**: Paged directly to the on-call engineer via PagerDuty (e.g., `TraceContextPropagationFailures` or `CriticalPathLatencySLAExceeded`).
- **Warning Alerts**: Dispatched to the `#ops-telemetry` Slack channel for review during business hours.
- **Triage Protocol**: Refer to the **Tracing Runbook** (`TRACING_RUNBOOK.md`) for detailed remediation steps.
