import { describe, expect, it } from "vitest";
import {
  auditRuntimeConfig,
  buildRuntimeConfigMetrics,
  captureRuntimeConfigSnapshot,
  createRuntimeConfigAudit,
} from "@/services/runtimeConfigAudit";

describe("runtime config auditing", () => {
  it("reports healthy configuration when all runtime values match policy", () => {
    const audit = createRuntimeConfigAudit({
      NEXT_PUBLIC_CHAIN_NETWORK: "testnet",
      NEXT_PUBLIC_TELEMETRY_MODE: "streaming",
      NEXT_PUBLIC_EXPORT_FORMAT: "ndjson",
      NEXT_PUBLIC_CANARY_PERCENT: "10",
    });

    expect(audit.status).toBe("healthy");
    expect(audit.summary).toEqual({ checked: 4, drifted: 0, critical: 0 });
  });

  it("flags critical and warning drift with service ownership metadata", () => {
    const audit = createRuntimeConfigAudit({
      NEXT_PUBLIC_CHAIN_NETWORK: "mainnet",
      NEXT_PUBLIC_TELEMETRY_MODE: "batch",
      NEXT_PUBLIC_EXPORT_FORMAT: "csv",
      NEXT_PUBLIC_CANARY_PERCENT: "25",
    });

    expect(audit.status).toBe("drift");
    expect(audit.summary).toEqual({ checked: 4, drifted: 4, critical: 2 });
    expect(audit.drifts[0]).toMatchObject({
      key: "NEXT_PUBLIC_CHAIN_NETWORK",
      service: "wallet",
      owner: "platform",
      severity: "critical",
      expected: "testnet",
      actual: "mainnet",
    });
  });

  it("keeps audit execution within the critical-path budget", () => {
    const snapshot = captureRuntimeConfigSnapshot({
      NEXT_PUBLIC_CHAIN_NETWORK: "testnet",
      NEXT_PUBLIC_TELEMETRY_MODE: "streaming",
      NEXT_PUBLIC_EXPORT_FORMAT: "ndjson",
      NEXT_PUBLIC_CANARY_PERCENT: "10",
    });

    const audit = auditRuntimeConfig(snapshot);

    expect(audit.durationMs).toBeLessThan(100);
  });

  it("emits scrapeable metrics for alerting and dashboards", () => {
    const metrics = buildRuntimeConfigMetrics(
      createRuntimeConfigAudit({ NEXT_PUBLIC_CHAIN_NETWORK: "mainnet" })
    );

    expect(metrics).toContain("runtime_config_checked 4");
    expect(metrics).toContain("runtime_config_critical 2");
  });
});
