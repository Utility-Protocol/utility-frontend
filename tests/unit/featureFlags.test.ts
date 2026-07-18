import { describe, it, expect, beforeEach, vi } from "vitest";
import { featureFlagsService } from "../../src/services/featureFlags";

describe("featureFlagsService", () => {
  beforeEach(() => {
    featureFlagsService.reset();
  });

  it("should initialize with default values", () => {
    const state = featureFlagsService.getState();
    expect(state.highFrequencyTelemetry).toBe(true);
    expect(state.heavyWeightTasks).toBe(true);
    expect(state.mapLODReduction).toBe(false);
  });

  it("should get and set individual flags", () => {
    expect(featureFlagsService.getFlag("highFrequencyTelemetry")).toBe(true);
    featureFlagsService.setFlag("highFrequencyTelemetry", false);
    expect(featureFlagsService.getFlag("highFrequencyTelemetry")).toBe(false);
  });

  it("should trigger subscription on change", () => {
    const listener = vi.fn();
    const unsubscribe = featureFlagsService.subscribe(listener);

    featureFlagsService.setFlag("mapLODReduction", true);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ mapLODReduction: true })
    );

    unsubscribe();
  });

  it("should reset flags to defaults", () => {
    featureFlagsService.setFlag("highFrequencyTelemetry", false);
    featureFlagsService.setFlag("mapLODReduction", true);

    featureFlagsService.reset();

    const state = featureFlagsService.getState();
    expect(state.highFrequencyTelemetry).toBe(true);
    expect(state.mapLODReduction).toBe(false);
  });
});
