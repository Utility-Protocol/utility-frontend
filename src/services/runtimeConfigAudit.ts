export type RuntimeConfigSeverity = "info" | "warning" | "critical";

export type RuntimeConfigValue = string | number | boolean | null | undefined;

export interface RuntimeConfigRule {
  key: string;
  expected: RuntimeConfigValue;
  owner: string;
  service: string;
  critical?: boolean;
  description: string;
}

export interface RuntimeConfigSnapshot {
  capturedAt: string;
  source: string;
  values: Record<string, RuntimeConfigValue>;
}

export interface RuntimeConfigDrift {
  key: string;
  service: string;
  owner: string;
  severity: RuntimeConfigSeverity;
  expected: RuntimeConfigValue;
  actual: RuntimeConfigValue;
  description: string;
}

export interface RuntimeConfigAuditResult {
  status: "healthy" | "drift";
  capturedAt: string;
  source: string;
  durationMs: number;
  summary: {
    checked: number;
    drifted: number;
    critical: number;
  };
  drifts: RuntimeConfigDrift[];
}

export const RUNTIME_CONFIG_RULES: RuntimeConfigRule[] = [
  {
    key: "NEXT_PUBLIC_CHAIN_NETWORK",
    expected: "testnet",
    owner: "platform",
    service: "wallet",
    description: "Wallet sessions must target the approved Stellar network.",
    critical: true,
  },
  {
    key: "NEXT_PUBLIC_TELEMETRY_MODE",
    expected: "streaming",
    owner: "observability",
    service: "telemetry",
    description: "Telemetry ingestion must remain in streaming mode for live drift alerts.",
    critical: true,
  },
  {
    key: "NEXT_PUBLIC_EXPORT_FORMAT",
    expected: "ndjson",
    owner: "data-platform",
    service: "export",
    description: "Export workers must emit the audited NDJSON format.",
  },
  {
    key: "NEXT_PUBLIC_CANARY_PERCENT",
    expected: 10,
    owner: "release-engineering",
    service: "deployment",
    description: "Blue-green canary traffic should stay at the approved rollout percentage.",
  },
];

export function parseRuntimeConfigValue(value: RuntimeConfigValue): RuntimeConfigValue {
  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim();
  if (normalized === "") {
    return undefined;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }

  const numeric = Number(normalized);
  return Number.isFinite(numeric) && normalized !== "" ? numeric : normalized;
}

export function captureRuntimeConfigSnapshot(
  env: Record<string, RuntimeConfigValue> = process.env,
  capturedAt = new Date().toISOString(),
  source = process.env.NEXT_PUBLIC_DEPLOYMENT_ID ?? "local"
): RuntimeConfigSnapshot {
  const values = Object.fromEntries(
    RUNTIME_CONFIG_RULES.map((rule) => [rule.key, parseRuntimeConfigValue(env[rule.key])])
  );

  return { capturedAt, source, values };
}

export function auditRuntimeConfig(
  snapshot: RuntimeConfigSnapshot,
  rules: RuntimeConfigRule[] = RUNTIME_CONFIG_RULES,
  startedAt = performance.now()
): RuntimeConfigAuditResult {
  const drifts = rules.flatMap<RuntimeConfigDrift>((rule) => {
    const actual = parseRuntimeConfigValue(snapshot.values[rule.key]);
    const expected = parseRuntimeConfigValue(rule.expected);

    if (Object.is(actual, expected)) {
      return [];
    }

    return [
      {
        key: rule.key,
        service: rule.service,
        owner: rule.owner,
        severity: rule.critical ? "critical" : "warning",
        expected,
        actual,
        description: rule.description,
      },
    ];
  });

  const critical = drifts.filter((drift) => drift.severity === "critical").length;

  return {
    status: drifts.length === 0 ? "healthy" : "drift",
    capturedAt: snapshot.capturedAt,
    source: snapshot.source,
    durationMs: Math.round((performance.now() - startedAt) * 100) / 100,
    summary: {
      checked: rules.length,
      drifted: drifts.length,
      critical,
    },
    drifts,
  };
}

export function createRuntimeConfigAudit(
  env?: Record<string, RuntimeConfigValue>,
  capturedAt?: string,
  source?: string
): RuntimeConfigAuditResult {
  const startedAt = performance.now();
  return auditRuntimeConfig(captureRuntimeConfigSnapshot(env, capturedAt, source), RUNTIME_CONFIG_RULES, startedAt);
}

export function buildRuntimeConfigMetrics(result: RuntimeConfigAuditResult): string {
  return [
    `runtime_config_checked ${result.summary.checked}`,
    `runtime_config_drifted ${result.summary.drifted}`,
    `runtime_config_critical ${result.summary.critical}`,
    `runtime_config_audit_duration_ms ${result.durationMs}`,
  ].join("\n");
}
