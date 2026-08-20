import { useSyncExternalStore, useEffect } from "react";
import { configurationManager, ConfigState } from "../config/ConfigurationManager";

/**
 * Hook to access the globally hot-reloaded configuration state.
 * Subscribes to the ConfigurationManager for real-time updates.
 */
export function useRuntimeConfig(): ConfigState {
  // Start polling when at least one component uses the hook
  useEffect(() => {
    configurationManager.startPolling();
    // In a real application, you might want a reference counting mechanism
    // to stop polling when no components are mounted. For simplicity here,
    // we keep polling alive once started.
  }, []);

  const config = useSyncExternalStore(
    (listener) => configurationManager.subscribe(listener),
    () => configurationManager.getConfig(),
    () => configurationManager.getConfig() // Server snapshot fallback
  );

  return config;
}
