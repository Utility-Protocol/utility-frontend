"use client";

import {
  assessDisasterRecoveryReadiness,
  DEFAULT_RECOVERY_OBJECTIVE,
  type RegionReplicationState,
} from "@/utils/disasterRecovery";

const demoRegions: RegionReplicationState[] = [
  {
    region: "us-east-1",
    role: "primary",
    health: "healthy",
    replicationLagMs: 820,
    p99LatencyMs: 74,
    lastRecoveryPointIso: "2026-07-18T00:00:00.000Z",
  },
  {
    region: "us-west-2",
    role: "replica",
    health: "healthy",
    replicationLagMs: 510,
    p99LatencyMs: 82,
    lastRecoveryPointIso: "2026-07-18T00:00:01.000Z",
  },
  {
    region: "eu-central-1",
    role: "standby",
    health: "healthy",
    replicationLagMs: 1_140,
    p99LatencyMs: 93,
    lastRecoveryPointIso: "2026-07-18T00:00:00.000Z",
  },
];

export interface DisasterRecoveryPanelProps {
  regions?: RegionReplicationState[];
}

function statusClass(status: string) {
  if (status === "pass" || status === "healthy") return "bg-emerald-500/15 text-emerald-600";
  if (status === "warning" || status === "degraded") return "bg-amber-500/15 text-amber-600";
  return "bg-red-500/15 text-red-600";
}

export function DisasterRecoveryPanel({ regions = demoRegions }: DisasterRecoveryPanelProps) {
  const assessment = assessDisasterRecoveryReadiness(regions);
  const messages = [...assessment.failedChecks, ...assessment.warnings];

  return (
    <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Multi-region readiness</p>
          <h2 className="mt-1 text-2xl font-bold">Replication & DR Testing</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Tracks regional lag, critical-path latency, failover capacity, and 99.99% availability readiness before blue-green promotion.
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold uppercase ${statusClass(assessment.status)}`}>
          {assessment.status}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-4">
        <Metric label="Availability" value={`${assessment.availabilityPercent}%`} target={`${DEFAULT_RECOVERY_OBJECTIVE.availabilityTarget}%`} />
        <Metric label="Max P99 latency" value={`${assessment.maxP99LatencyMs} ms`} target="< 100 ms" />
        <Metric label="Max lag" value={`${assessment.maxReplicationLagMs} ms`} target="< 5,000 ms" />
        <Metric label="Failover target" value={assessment.recommendedFailoverRegion ?? "none"} target="lowest lag" />
      </div>

      <div className="mt-5 overflow-hidden rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Region</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Health</th>
              <th className="px-3 py-2">Lag</th>
              <th className="px-3 py-2">P99</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((region) => (
              <tr key={region.region} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{region.region}</td>
                <td className="px-3 py-2">{region.role}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(region.health)}`}>{region.health}</span>
                </td>
                <td className="px-3 py-2 tabular-nums">{region.replicationLagMs} ms</td>
                <td className="px-3 py-2 tabular-nums">{region.p99LatencyMs} ms</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {messages.length > 0 ? (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          {messages.map((message) => <li key={message}>{message}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function Metric({ label, value, target }: { label: string; value: string; target: string }) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">Target: {target}</p>
    </div>
  );
}
