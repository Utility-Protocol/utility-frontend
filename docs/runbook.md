# Operator Runbook: Feature Flags & Capacity Shedding

This document provides instructions for operations teams to monitor, override, configure, and safely deploy the Utility Protocol application under load.

---

## 1. Capacity Shedding Thresholds

The capacity-shedding engine operates in **Auto (Adaptive)** mode by default. It monitors three core indicators and escalates shedding severity to protect critical paths:

| Indicator | Normal | Degraded | Critical |
|-----------|--------|----------|----------|
| **Frame Rate (FPS)** | &ge; 40 FPS | < 40 FPS (e.g., CPU load) | < 25 FPS (Extreme thread lock) |
| **WS Latency (ms)** | < 150ms | &ge; 150ms (Unstable link) | &ge; 400ms (High packet drop) |
| **Tx Queue Size** | < 5 | &ge; 5 pending | &ge; 10 pending (RPC backlog) |

### Triggered Actions:
- **Degraded Level:**
  - High-frequency telemetry canvas rendering is **paused**.
  - Ingestion continues, and operator can view static/un-animated stats updates.
- **Critical Level:**
  - In addition to telemetry pause, **heavyweight client tasks (such as ZK proof generations and bulk CSV/GeoJSON exports) are completely locked**.
  - Map Level of Detail is forced to **LOD Reduction (Low-Detail)**.

---

## 2. Manual Operator Intervention

If the automatic adaptive engine fails or if an operator wants to manually enforce safety levels:

### Enforcing Level via Dashboard:
1. Navigate to the **Shedding Mode & Levels** console.
2. Click **Manual Override**. This stops the auto-evaluation of real-time metrics.
3. Click **CRITICAL** (or **DEGRADED**) to force load-shedding states.
4. Once the incident is resolved, click **Auto (Adaptive)** to return to live metric evaluation.

### Force-restoring features manually:
Even in automatic mode, feature flags can be toggled individually on the **Feature Flags Override Panel** to isolate issues.
- To disable live telemetry rendering without affecting ZK/Export: Turn off **High-Freq Telemetry** toggle.

---

## 3. Deployment Strategy: Blue-Green

For system-wide high availability (99.99% uptime), all deployments of the Utility frontend must follow a strict **Blue-Green deployment strategy**:

### Deployment Sequence:
1. **Provision Green Environment:** Spin up a copy of the build matching the target version in an isolated subnet.
2. **Warm-Up/Smoke Testing:** Perform active verification on the Green slot using mock RPC parameters and simulated latency.
3. **Traffic Shift:** Shift router weights incrementally (e.g., using Cloudflare Pages / AWS Route53 weight rules):
   - Shift 10% of users to Green (Canary phase).
   - Evaluate Canary metrics (see below).
   - Shift 100% of traffic to Green once validated.
4. **Decommission Blue Slot:** Retain the previous Blue slot for 24 hours as an instant rollback target, then terminate.

---

## 4. Canary Analysis & Rollback Criteria

During the 10% Canary shift phase, the deployment engine and operators must monitor key metrics:

### Target Metrics:
- **P99 Critical Path Latency:** Must remain **< 100ms**.
- **Error Rate:** HTTP 5xx or unhandled JS exceptions must be **< 0.01%**.
- **Average FPS:** Main thread FPS must remain **&ge; 50 FPS** on healthy nodes.

### Automatic Rollback Triggers:
Immediate automated rollback to the Blue slot must occur if any of the following triggers are tripped:
- **P99 Latency > 150ms** for longer than 3 minutes.
- **System uptime falls below 99.99%** (defined by HTTP error rate spikes).
- **Core heap memory consumption exceeds 500MB** (detectable memory leaks).
