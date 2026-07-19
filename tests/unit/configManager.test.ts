import { describe, expect, it, vi } from "vitest";
import { ConfigManager, redactConfig, systemConfigSchema, validateConfig, type ConfigSchema } from "@/services/configManager";

const schema: ConfigSchema = {
  endpoint: { type: "string", required: true },
  timeoutMs: { type: "number", default: 100, validate: (value) => (Number(value) < 1_000 ? true : "is too high") },
  enabled: { type: "boolean", default: true },
  token: { type: "string", sensitive: true },
};

describe("validateConfig", () => {
  it("applies required, type, and custom validation rules", () => {
    expect(validateConfig({ endpoint: "https://api.example", timeoutMs: 500 }, schema)).toEqual([]);
    expect(validateConfig({ timeoutMs: 1_500, enabled: "yes" as never }, schema)).toEqual([
      { key: "endpoint", message: "is required" },
      { key: "timeoutMs", message: "is too high" },
      { key: "enabled", message: "must be boolean" },
    ]);
  });
});

describe("ConfigManager", () => {
  it("hydrates defaults and exposes immutable snapshots", () => {
    const manager = new ConfigManager({ schema, initial: { endpoint: "local" } });
    const snapshot = manager.getSnapshot();
    expect(snapshot).toMatchObject({ endpoint: "local", timeoutMs: 100, enabled: true });

    (snapshot as Record<string, unknown>).endpoint = "mutated";
    expect(manager.get("endpoint")).toBe("local");
  });

  it("hot-reloads valid changes and notifies subscribers", () => {
    const onMetric = vi.fn();
    const manager = new ConfigManager({ schema, initial: { endpoint: "v1" }, now: () => 10, onMetric });
    const listener = vi.fn();
    manager.subscribe(listener);

    const result = manager.apply({ endpoint: "v2", token: "secret" });

    expect(result.ok).toBe(true);
    expect(manager.getVersion()).toBe(1);
    expect(manager.get("endpoint")).toBe("v2");
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ changedKeys: ["endpoint", "token"], version: 1 }));
    expect(onMetric).toHaveBeenCalledWith("config.reload_latency_ms", 0, { result: "success" });
  });

  it("rejects invalid hot-reload payloads without changing active config", () => {
    const onValidationError = vi.fn();
    const manager = new ConfigManager({ schema, initial: { endpoint: "v1" }, onValidationError });

    const result = manager.apply({ timeoutMs: 2_000 });

    expect(result.ok).toBe(false);
    expect(manager.get("timeoutMs")).toBe(100);
    expect(manager.getVersion()).toBe(0);
    expect(onValidationError).toHaveBeenCalledWith([{ key: "timeoutMs", message: "is too high" }]);
  });

  it("polls an async source for new configuration until stopped", async () => {
    vi.useFakeTimers();
    const manager = new ConfigManager({ schema, initial: { endpoint: "v1" } });
    const load = vi.fn().mockResolvedValue({ endpoint: "v2" });

    const poller = manager.createPoller(load, 250);
    await vi.advanceTimersByTimeAsync(250);
    expect(manager.get("endpoint")).toBe("v2");

    poller.stop();
    await vi.advanceTimersByTimeAsync(250);
    expect(load).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});

describe("systemConfigSchema", () => {
  it("documents production safety bounds", () => {
    expect(validateConfig({ apiBaseUrl: "https://api.example", canaryPercent: 101 }, systemConfigSchema)).toEqual([
      { key: "canaryPercent", message: "must be between 0 and 100" },
    ]);
  });

  it("redacts sensitive fields for logs and dashboards", () => {
    expect(redactConfig({ apiBaseUrl: "x", alertWebhookUrl: "secret" }, systemConfigSchema)).toEqual({
      apiBaseUrl: "x",
      alertWebhookUrl: "[REDACTED]",
    });
  });
});
