import { RUNTIME_CONFIG_RULES, RuntimeConfigValue, parseRuntimeConfigValue } from "../services/runtimeConfigAudit";

export type ConfigState = Record<string, RuntimeConfigValue>;

export type ConfigChangeListener = (newConfig: ConfigState) => void;

export interface ConfigurationManagerOptions {
  pollingIntervalMs?: number;
  configEndpoint?: string;
}

export class ConfigurationManager {
  private config: ConfigState;
  private listeners: Set<ConfigChangeListener> = new Set();
  private pollingIntervalId?: ReturnType<typeof setInterval>;
  private pollingIntervalMs: number;
  private configEndpoint: string;
  private isFetching = false;

  constructor(options?: ConfigurationManagerOptions) {
    this.pollingIntervalMs = options?.pollingIntervalMs ?? 30000;
    this.configEndpoint = options?.configEndpoint ?? "/api/config";
    this.config = this.getInitialConfig();
  }

  /**
   * Initializes the config from process.env as the baseline.
   */
  private getInitialConfig(): ConfigState {
    const baseConfig: ConfigState = {};
    for (const rule of RUNTIME_CONFIG_RULES) {
      baseConfig[rule.key] = parseRuntimeConfigValue(process.env[rule.key]);
    }
    return baseConfig;
  }

  /**
   * Subscribes to configuration changes.
   */
  public subscribe(listener: ConfigChangeListener): () => void {
    this.listeners.add(listener);
    // Immediately emit current config to the new listener
    listener(this.config);
    return () => this.listeners.delete(listener);
  }

  /**
   * Starts polling the configuration endpoint.
   */
  public startPolling(): void {
    if (this.pollingIntervalId) return;
    this.fetchConfig(); // Fetch immediately
    this.pollingIntervalId = setInterval(() => this.fetchConfig(), this.pollingIntervalMs);
  }

  /**
   * Stops polling the configuration endpoint.
   */
  public stopPolling(): void {
    if (this.pollingIntervalId) {
      clearInterval(this.pollingIntervalId);
      this.pollingIntervalId = undefined;
    }
  }

  /**
   * Gets the current configuration state synchronously.
   */
  public getConfig(): ConfigState {
    return this.config;
  }

  /**
   * Fetches, validates, and applies the remote configuration.
   */
  public async fetchConfig(): Promise<void> {
    if (this.isFetching) return;
    this.isFetching = true;

    try {
      const response = await fetch(this.configEndpoint, {
        headers: { "Cache-Control": "no-cache" },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch config: ${response.statusText}`);
      }

      const rawData = await response.json();
      const validatedData = this.validateSchema(rawData);

      if (this.hasConfigDrifted(this.config, validatedData)) {
        this.config = { ...this.config, ...validatedData };
        this.notifyListeners();
      }
    } catch (error) {
      console.error("[ConfigurationManager] Error fetching config:", error);
    } finally {
      this.isFetching = false;
    }
  }

  /**
   * Basic schema validation ensuring only known keys of valid types are merged.
   */
  private validateSchema(data: unknown): ConfigState {
    if (typeof data !== "object" || data === null) {
      return {};
    }

    const validated: ConfigState = {};
    const record = data as Record<string, unknown>;

    for (const rule of RUNTIME_CONFIG_RULES) {
      if (rule.key in record) {
        // Ensure values are parsed correctly (e.g., string to number/boolean if needed)
        const parsed = parseRuntimeConfigValue(record[rule.key] as string);
        validated[rule.key] = parsed;
      }
    }

    return validated;
  }

  private hasConfigDrifted(oldConfig: ConfigState, newConfig: ConfigState): boolean {
    for (const key in newConfig) {
      if (!Object.is(oldConfig[key], newConfig[key])) {
        return true;
      }
    }
    return false;
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.config);
      } catch (err) {
        console.error("[ConfigurationManager] Listener error:", err);
      }
    }
  }
}

// Export a singleton instance for system-wide usage
export const configurationManager = new ConfigurationManager();
