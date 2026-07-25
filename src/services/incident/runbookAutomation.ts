export type IncidentSeverity = "critical" | "high" | "medium" | "low";

export interface IncidentSignal {
  id: string;
  service: string;
  summary: string;
  severity: IncidentSeverity;
  metric: string;
  value: number;
  threshold: number;
  occurredAt: string;
  dedupeKey?: string;
}

export interface RunbookStep {
  id: string;
  label: string;
  command: string;
  timeoutMs: number;
  rollbackCommand?: string;
  criticalPath?: boolean;
}

export interface RunbookPlan {
  planId: string;
  incidentKey: string;
  severity: IncidentSeverity;
  escalationPolicy: string;
  pagerDutyRoutingKey: string;
  steps: RunbookStep[];
  monitors: string[];
  deployment: {
    strategy: "blue-green";
    canaryPercentage: number;
    analysisWindowMinutes: number;
    rollbackOnSloBreach: boolean;
  };
  securityReviewRequired: boolean;
  targets: {
    p99LatencyMs: number;
    availability: string;
  };
}

export interface PagerDutyEventPayload {
  routing_key: string;
  event_action: "trigger";
  dedup_key: string;
  payload: {
    summary: string;
    source: string;
    severity: "critical" | "error" | "warning" | "info";
    custom_details: Record<string, unknown>;
  };
  links: Array<{ href: string; text: string }>;
}

const severityToPagerDutySeverity: Record<IncidentSeverity, PagerDutyEventPayload["payload"]["severity"]> = {
  critical: "critical",
  high: "error",
  medium: "warning",
  low: "info",
};

const DEFAULT_TARGETS = {
  p99LatencyMs: 100,
  availability: "99.99%",
};

export function buildIncidentKey(signal: IncidentSignal): string {
  return signal.dedupeKey ?? `${signal.service}:${signal.metric}:${signal.severity}`;
}

export function createRunbookPlan(signal: IncidentSignal, routingKey: string): RunbookPlan {
  const incidentKey = buildIncidentKey(signal);
  const isCritical = signal.severity === "critical" || signal.severity === "high";

  return {
    planId: `runbook-${incidentKey}`,
    incidentKey,
    severity: signal.severity,
    escalationPolicy: isCritical ? "primary-on-call" : "business-hours-triage",
    pagerDutyRoutingKey: routingKey,
    steps: [
      {
        id: "snapshot",
        label: "Capture diagnostics and freeze current telemetry window",
        command: `utilityctl incidents snapshot --service ${signal.service} --metric ${signal.metric}`,
        timeoutMs: 15_000,
        criticalPath: true,
      },
      {
        id: "mitigate",
        label: "Route traffic to healthy blue-green pool",
        command: `utilityctl deploy shift --service ${signal.service} --target green --canary 10`,
        rollbackCommand: `utilityctl deploy shift --service ${signal.service} --target blue --canary 0`,
        timeoutMs: 30_000,
        criticalPath: true,
      },
      {
        id: "verify",
        label: "Run canary SLO analysis before broad rollout",
        command: `utilityctl slo verify --service ${signal.service} --p99 ${DEFAULT_TARGETS.p99LatencyMs} --availability ${DEFAULT_TARGETS.availability}`,
        timeoutMs: 45_000,
        criticalPath: true,
      },
    ],
    monitors: [
      `${signal.service}.latency.p99`,
      `${signal.service}.availability`,
      `${signal.service}.pagerduty.events`,
      `${signal.service}.runbook.step.duration`,
    ],
    deployment: {
      strategy: "blue-green",
      canaryPercentage: 10,
      analysisWindowMinutes: isCritical ? 5 : 15,
      rollbackOnSloBreach: true,
    },
    securityReviewRequired: true,
    targets: DEFAULT_TARGETS,
  };
}

export function createPagerDutyEvent(signal: IncidentSignal, plan: RunbookPlan, runbookUrl: string): PagerDutyEventPayload {
  return {
    routing_key: plan.pagerDutyRoutingKey,
    event_action: "trigger",
    dedup_key: plan.incidentKey,
    payload: {
      summary: signal.summary,
      source: signal.service,
      severity: severityToPagerDutySeverity[signal.severity],
      custom_details: {
        metric: signal.metric,
        value: signal.value,
        threshold: signal.threshold,
        occurredAt: signal.occurredAt,
        planId: plan.planId,
        escalationPolicy: plan.escalationPolicy,
        securityReviewRequired: plan.securityReviewRequired,
        p99LatencyTargetMs: plan.targets.p99LatencyMs,
        availabilityTarget: plan.targets.availability,
      },
    },
    links: [{ href: runbookUrl, text: "Incident response runbook" }],
  };
}

export async function triggerPagerDutyIncident(
  endpoint: string,
  event: PagerDutyEventPayload,
  fetcher: typeof fetch = fetch
): Promise<{ ok: boolean; status: number }> {
  const response = await fetcher(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(event),
  });

  return { ok: response.ok, status: response.status };
}
