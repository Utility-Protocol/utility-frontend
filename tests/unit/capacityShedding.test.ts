import { describe, it, expect, beforeEach, vi } from "vitest";
import { capacitySheddingService } from "../../src/services/capacityShedding";
import { featureFlagsService } from "../../src/services/featureFlags";

describe("capacitySheddingService", () => {
  beforeEach(() => {
    capacitySheddingService.reset();
    featureFlagsService.reset();
  });

  it("should initialize with default metrics and healthy state", () => {
    const state = capacitySheddingService.getState();
    expect(state.level).toBe("healthy");
    expect(state.mode).toBe("auto");
    expect(state.fps).toBe(60);
    expect(state.latency).toBe(50);
  });

  it("should trigger degraded state on slow frame-rate under auto mode", () => {
    capacitySheddingService.updateMetrics({ fps: 35 });
    expect(capacitySheddingService.getState().level).toBe("degraded");
    // Under degraded mode, highFrequencyTelemetry should automatically be set to false.
    expect(featureFlagsService.getFlag("highFrequencyTelemetry")).toBe(false);
    expect(featureFlagsService.getFlag("heavyWeightTasks")).toBe(true);
  });

  it("should trigger critical state under high network latency", () => {
    capacitySheddingService.updateMetrics({ latency: 450 });
    const state = capacitySheddingService.getState();
    expect(state.level).toBe("critical");
    // Under critical mode: highFrequencyTelemetry and heavyWeightTasks should be false, mapLODReduction should be true
    expect(featureFlagsService.getFlag("highFrequencyTelemetry")).toBe(false);
    expect(featureFlagsService.getFlag("heavyWeightTasks")).toBe(false);
    expect(featureFlagsService.getFlag("mapLODReduction")).toBe(true);
  });

  it("should respect manual override mode", () => {
    capacitySheddingService.setMode("manual");
    capacitySheddingService.setLevel("critical");

    expect(capacitySheddingService.getState().level).toBe("critical");
    expect(featureFlagsService.getFlag("highFrequencyTelemetry")).toBe(false);

    // Metrics updates should NOT automatically change the level under manual mode
    capacitySheddingService.updateMetrics({ fps: 60, latency: 10, pendingTransactions: 0 });
    expect(capacitySheddingService.getState().level).toBe("critical");
  });

  it("should support subscriptions", () => {
    const listener = vi.fn();
    const unsubscribe = capacitySheddingService.subscribe(listener);

    capacitySheddingService.updateMetrics({ latency: 500 }); // Critical trigger

    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });
});
