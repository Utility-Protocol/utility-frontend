# Deployment Strategy: Blue-Green Deployment and Canary Analysis

This document describes the blue-green deployment process and canary analysis strategy for rolling out distributed tracing across our services.

---

## 1. Blue-Green Rollout Strategy

To achieve our **99.99% availability target**, we employ a strict blue-green deployment topology for tracing logic:

```
                  [ Public Load Balancer / DNS ]
                                 |
                 +---------------+---------------+
                 | (Weight: 100% -> 0%)          | (Weight: 0% -> 100%)
                 v                               v
        +------------------+           +------------------+
        |   Blue Cluster   |           |  Green Cluster   |
        | (Current Stable) |           | (New Release with|
        |                  |           |     Tracing)     |
        +------------------+           +------------------+
```

### Rollout Procedure
1. **Provision Green Environment**: Deploy the updated tracing code to the Green cluster. It remains isolated from production traffic.
2. **Smoke Testing**: Run automated end-to-end integration tests against the Green environment to verify that tracing headers are parsed and emitted.
3. **Canary Weighted Routing**: Shift 2% of production traffic to the Green cluster (the canary phase).
4. **Evaluate Metrics**: Run Canary Analysis on the Green environment's latency and error profiles (see below).
5. **Gradual Promotion**: Increase Green cluster traffic weight: `2% -> 10% -> 50% -> 100%`.
6. **Teardown Blue Cluster**: Keep the Blue cluster online for 24 hours as a hot-standby, then tear it down or mark it as the staging candidate.

---

## 2. Canary Analysis & Thresholds

During the canary promotion phase, automated monitoring systems perform automated canary analysis (ACA) using Prometheus metrics to compare the Canary (Green) and Baseline (Blue) performance:

### Canary Metrics Comparison Matrix

| Evaluation Metric | Baseline (Blue) | Target Canary (Green) | Action on Failure |
|-------------------|-----------------|-----------------------|-------------------|
| **Critical Path Latency** | P99 < 85ms | **P99 < 100ms** (Overhead < 5ms) | Immediate rollback to Blue |
| **HTTP Error Rate** | < 0.01% | **< 0.01%** | Immediate rollback to Blue |
| **Tracing Drop Rate** | N/A | **< 0.1%** | Pause canary promotion |
| **Memory Utilization** | Stable | **Stable (+ <5MB deviation)** | Pause and investigate memory leak |

---

## 3. Immediate Rollback Playbook

If any of the canary thresholds are violated (e.g., critical path latency hits 110ms or error rates spike):
1. **Trigger Automated Rollback**: The load balancer weight is instantly flipped back to `100% Blue / 0% Green`. This switch takes `< 1 second`.
2. **Isolate Green Cluster**: Retain a small replica of the failing Green cluster under a private debug route (`debug.canary.utilityprotocol.internal`) for developer diagnosis.
3. **Notify Engineering**: Dispatch a critical incident alert to `#ops-incidents` with the metrics that triggered the rollback (e.g., "Rollback initiated: Canary P99 latency exceeded 100ms SLA, current value 114ms").
