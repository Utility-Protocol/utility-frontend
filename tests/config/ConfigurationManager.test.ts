import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ConfigurationManager } from "../../src/config/ConfigurationManager";
import { RUNTIME_CONFIG_RULES } from "../../src/services/runtimeConfigAudit";

describe("ConfigurationManager", () => {
  let manager: ConfigurationManager;

  beforeEach(() => {
    // Reset env
    process.env = {
      NEXT_PUBLIC_CHAIN_NETWORK: "mainnet",
      NEXT_PUBLIC_TELEMETRY_MODE: "batch",
      NEXT_PUBLIC_CANARY_PERCENT: "5",
    };
    manager = new ConfigurationManager({ pollingIntervalMs: 1000 });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    manager.stopPolling();
  });

  it("should initialize with values from process.env", () => {
    const config = manager.getConfig();
    expect(config["NEXT_PUBLIC_CHAIN_NETWORK"]).toBe("mainnet");
    expect(config["NEXT_PUBLIC_TELEMETRY_MODE"]).toBe("batch");
    expect(config["NEXT_PUBLIC_CANARY_PERCENT"]).toBe(5); // parsed to number
  });

  it("should fetch and apply valid configuration updates", async () => {
    const mockResponse = {
      NEXT_PUBLIC_CHAIN_NETWORK: "testnet", // changed
      NEXT_PUBLIC_CANARY_PERCENT: "15", // changed
      UNKNOWN_KEY: "ignored",
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const listener = vi.fn();
    manager.subscribe(listener);

    // Initial call to listener with base config
    expect(listener).toHaveBeenCalledTimes(1);

    await manager.fetchConfig();

    const newConfig = manager.getConfig();
    expect(newConfig["NEXT_PUBLIC_CHAIN_NETWORK"]).toBe("testnet");
    expect(newConfig["NEXT_PUBLIC_CANARY_PERCENT"]).toBe(15);
    expect(newConfig["UNKNOWN_KEY"]).toBeUndefined();

    // Listener should be called with updated config
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[1][0]).toEqual(newConfig);
  });

  it("should not notify listeners if config hasn't drifted", async () => {
    // Simulate same config as process.env
    const mockResponse = {
      NEXT_PUBLIC_CHAIN_NETWORK: "mainnet",
      NEXT_PUBLIC_TELEMETRY_MODE: "batch",
      NEXT_PUBLIC_CANARY_PERCENT: 5,
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    });

    const listener = vi.fn();
    manager.subscribe(listener);

    expect(listener).toHaveBeenCalledTimes(1);

    await manager.fetchConfig();

    // Listener should not be called again
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("should poll periodically", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });

    manager.startPolling();
    
    // fetchConfig is called immediately upon startPolling
    expect(global.fetch).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(global.fetch).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(1000);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
