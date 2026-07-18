"use client";

import { useSyncExternalStore } from "react";
import { featureFlagsService, type FeatureFlagsState, type FeatureFlagName } from "@/services/featureFlags";

export function useFeatureFlags(): {
  flags: FeatureFlagsState;
  setFlag: (name: FeatureFlagName, value: boolean) => void;
  resetFlags: () => void;
} {
  const flags = useSyncExternalStore(
    (listener) => featureFlagsService.subscribe(listener),
    () => featureFlagsService.getState(),
    () => featureFlagsService.getState()
  );

  return {
    flags,
    setFlag: (name, value) => featureFlagsService.setFlag(name, value),
    resetFlags: () => featureFlagsService.reset(),
  };
}
