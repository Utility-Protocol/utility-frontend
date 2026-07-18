# Architecture Design: Graceful Degradation & Capacity Shedding

This document outlines the system-wide architecture for Graceful Degradation, Feature Flagging, and Capacity Shedding in the Utility Protocol frontend application.

## 1. System Objectives

- **High Availability (99.99% uptime):** Keep critical features accessible even during extreme load spikes, browser resource exhaustion, or network degradation.
- **Low Latency (< 100ms P99):** Ensure key operator actions (e.g., viewing connection quality, sending transactions) complete quickly by shedding computationally heavy or high-frequency render overhead.
- **Predictable Degradation:** Smoothly turn off low-priority features (non-critical paths) before they can degrade critical paths.

---

## 2. Core Components

### A. Feature Flagging Service (`src/services/featureFlags.ts`)
A lightweight, reactive, and thread-safe store managing application feature flags.
- **Persistence:** LocalStorage is used to persist overrides across browser reloads.
- **Core Toggles:**
  - `highFrequencyTelemetry`: Toggles whether the live data chart runs at high frequency. When disabled, telemetry downsamples or pauses visual rendering.
  - `heavyWeightTasks`: Allows/disallows heavy tasks such as ZK submissions and large file exports.
  - `mapLODReduction`: Reduces ThreeJS WebGL map rendering details, using low level of detail (LOD) or turning off complex layers.

### B. Adaptive Capacity Shedding (`src/services/capacityShedding.ts`)
A telemetry-driven engine that measures system health metrics and acts as a load-shedding circuit breaker.
- **Monitored Metrics:**
  - **Frame Rate (FPS):** Derived from R.A.F frame-to-frame intervals (e.g., > 33ms slow frames).
  - **Network Latency:** Derived from connection/websocket heartbeats.
  - **Task Queue length:** Count of pending transactions/operations.
- **Shedding Levels:**
  - **Healthy:** All features enabled.
  - **Degraded:** Telemetry rendering is slowed down, pre-fetching is throttled, minor map details hidden.
  - **Critical:** Heavy tasks (ZK, Export) are blocked/deferred. High-frequency telemetry canvas drawing is completely halted.

---

## 3. Degradation Matrix

| Component | Healthy State | Degraded State | Critical State |
|-----------|---------------|----------------|----------------|
| **Connection Bar** | Green (Stable, live drift) | Yellow (Degraded, unstable warning) | Red / Critical Warning |
| **Telemetry Chart** | Full canvas drawing at 60 FPS | Low-FPS/throttled drawing | Canvas drawing halted, static average displayed |
| **ZK proof submissions** | Immediate submission | Submitted with background warning | Blocked/Deferred (Show capacity warning) |
| **Data Export** | Available | Refused / Deferred with warning | Blocked completely |
| **Grid Map** | Full asset instancing + WebGL shaders | Lower LOD, hidden layers | Basic fallback layer |

---

## 4. Performance & Security Considerations

- **P99 Latency (< 100ms):** When in "Critical" shedding mode, disabling JS canvas animations and deferring ZK proof generations reduces main thread CPU blockage, keeping interactive latencies under 100ms.
- **Security:** Feature toggles and shedding overrides are client-side safety measures. Server-side APIs must independently enforce rate limits and validate capability tokens.
