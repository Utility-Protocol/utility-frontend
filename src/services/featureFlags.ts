"use client";

export type FeatureFlagName =
  | "highFrequencyTelemetry"
  | "heavyWeightTasks"
  | "mapLODReduction";

export interface FeatureFlagsState {
  highFrequencyTelemetry: boolean;
  heavyWeightTasks: boolean;
  mapLODReduction: boolean;
}

const STORAGE_KEY = "utility-feature-flags";

const defaultFlags: FeatureFlagsState = {
  highFrequencyTelemetry: true,
  heavyWeightTasks: true,
  mapLODReduction: false,
};

type FeatureFlagListener = (state: FeatureFlagsState) => void;

class FeatureFlagsService {
  private state: FeatureFlagsState = { ...defaultFlags };
  private listeners = new Set<FeatureFlagListener>();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window !== "undefined") {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          this.state = {
            ...defaultFlags,
            ...parsed,
          };
        }
      } catch (e) {
        console.error("Failed to parse stored feature flags", e);
      }
    }
  }

  private saveToStorage() {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      } catch (e) {
        console.error("Failed to save feature flags to storage", e);
      }
    }
  }

  getState(): Readonly<FeatureFlagsState> {
    return this.state;
  }

  getFlag(name: FeatureFlagName): boolean {
    return this.state[name];
  }

  setFlag(name: FeatureFlagName, value: boolean) {
    if (this.state[name] !== value) {
      this.state = {
        ...this.state,
        [name]: value,
      };
      this.saveToStorage();
      this.notify();
    }
  }

  reset() {
    this.state = { ...defaultFlags };
    this.saveToStorage();
    this.notify();
  }

  subscribe(listener: FeatureFlagListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (e) {
        console.error("Error in feature flag listener", e);
      }
    }
  }
}

export const featureFlagsService = new FeatureFlagsService();
