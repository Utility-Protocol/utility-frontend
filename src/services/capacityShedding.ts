"use client";

import { featureFlagsService } from "./featureFlags";

export type SheddingLevel = "healthy" | "degraded" | "critical";
export type SheddingMode = "auto" | "manual";

export interface CapacitySheddingState {
  level: SheddingLevel;
  mode: SheddingMode;
  fps: number;
  latency: number;
  pendingTransactions: number;
}

const STORAGE_KEY = "utility-capacity-shedding";

const defaultState: CapacitySheddingState = {
  level: "healthy",
  mode: "auto",
  fps: 60,
  latency: 50,
  pendingTransactions: 0,
};

type CapacitySheddingListener = (state: CapacitySheddingState) => void;

class CapacitySheddingService {
  private state: CapacitySheddingState = { ...defaultState };
  private listeners = new Set<CapacitySheddingListener>();
  private lastEvaluationTime = 0;

  constructor() {
    this.loadFromStorage();
    if (typeof window !== "undefined") {
      this.lastEvaluationTime = Date.now();
    }
  }

  private loadFromStorage() {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.state = {
            ...defaultState,
            ...parsed,
          };
          if (this.state.mode === "auto") {
            // Re-evaluate state immediately under auto mode
            this.evaluateState();
          }
        }
      } catch (e) {
        console.error("Failed to parse capacity shedding state", e);
      }
    }
  }

  private saveToStorage() {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        console.error("Failed to save capacity shedding state", e);
      }
    }
  }

  getState(): Readonly<CapacitySheddingState> {
    return this.state;
  }

  setMode(mode: SheddingMode) {
    if (this.state.mode !== mode) {
      this.state = { ...this.state, mode };
      if (mode === "auto") {
        this.evaluateState();
      } else {
        this.saveToStorage();
        this.notify();
      }
    }
  }

  setLevel(level: SheddingLevel) {
    if (this.state.level !== level) {
      this.state = { ...this.state, level };
      this.saveToStorage();
      this.notify();
      this.applySheddingSideEffects();
    }
  }

  updateMetrics(metrics: Partial<Pick<CapacitySheddingState, "fps" | "latency" | "pendingTransactions">>) {
    this.state = {
      ...this.state,
      ...metrics,
    };
    if (this.state.mode === "auto") {
      this.evaluateState();
    } else {
      this.notify();
    }
  }

  private evaluateState() {
    const { fps, latency, pendingTransactions } = this.state;
    let targetLevel: SheddingLevel = "healthy";

    // Threshold triggers:
    // Critical overrides Degraded.
    if (fps <= 25 || latency >= 400 || pendingTransactions >= 10) {
      targetLevel = "critical";
    } else if (fps <= 40 || latency >= 150 || pendingTransactions >= 5) {
      targetLevel = "degraded";
    }

    if (this.state.level !== targetLevel) {
      this.state = {
        ...this.state,
        level: targetLevel,
      };
      this.saveToStorage();
      this.notify();
      this.applySheddingSideEffects();
    }
  }

  private applySheddingSideEffects() {
    const { level } = this.state;
    // Automatic adaptive flags when shedding changes
    if (level === "critical") {
      // Critical shedding -> Halt telemetry render, disable heavy tasks, force low LOD
      featureFlagsService.setFlag("highFrequencyTelemetry", false);
      featureFlagsService.setFlag("heavyWeightTasks", false);
      featureFlagsService.setFlag("mapLODReduction", true);
    } else if (level === "degraded") {
      // Degraded shedding -> Reduce telemetry frequency, but tasks and medium LOD can remain
      featureFlagsService.setFlag("highFrequencyTelemetry", false);
      featureFlagsService.setFlag("heavyWeightTasks", true);
      featureFlagsService.setFlag("mapLODReduction", false);
    } else {
      // Healthy -> restore everything back to defaults (or whatever is stored/default)
      featureFlagsService.setFlag("highFrequencyTelemetry", true);
      featureFlagsService.setFlag("heavyWeightTasks", true);
      featureFlagsService.setFlag("mapLODReduction", false);
    }
  }

  reset() {
    this.state = { ...defaultState };
    this.saveToStorage();
    this.notify();
    this.applySheddingSideEffects();
  }

  subscribe(listener: CapacitySheddingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        console.error("Error in capacity shedding listener", e);
      }
    }
  }
}

export const capacitySheddingService = new CapacitySheddingService();
