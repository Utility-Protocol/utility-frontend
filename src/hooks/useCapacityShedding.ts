"use client";

import { useSyncExternalStore } from "react";
import {
  capacitySheddingService,
  type CapacitySheddingState,
  type SheddingLevel,
  type SheddingMode,
} from "@/services/capacityShedding";

export function useCapacityShedding(): {
  state: CapacitySheddingState;
  setMode: (mode: SheddingMode) => void;
  setLevel: (level: SheddingLevel) => void;
  updateMetrics: (
    metrics: Partial<Pick<CapacitySheddingState, "fps" | "latency" | "pendingTransactions">>
  ) => void;
  resetShedding: () => void;
} {
  const state = useSyncExternalStore(
    (listener) => capacitySheddingService.subscribe(listener),
    () => capacitySheddingService.getState(),
    () => capacitySheddingService.getState()
  );

  return {
    state,
    setMode: (mode) => capacitySheddingService.setMode(mode),
    setLevel: (level) => capacitySheddingService.setLevel(level),
    updateMetrics: (metrics) => capacitySheddingService.updateMetrics(metrics),
    resetShedding: () => capacitySheddingService.reset(),
  };
}
