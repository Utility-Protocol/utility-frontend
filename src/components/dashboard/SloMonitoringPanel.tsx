import {
  DEFAULT_BURN_RATE_THRESHOLDS,
  DEFAULT_SLO_OBJECTIVES,
  calculateBurnRate,
  calculateCompliance,
  calculateErrorBudgetRemaining,
  evaluateBurnRateAlerts,
  type SloMeasurement,
} from "@/utils/slo";

const SAMPLE_MEASUREMENTS: SloMeasurement[] = [
  { objectiveId: "critical-path-latency", window: "5m", goodEvents: 499_970, totalEvents: 500_000, latencyP99Ms: 92 },
  { objectiveId: "critical-path-latency", window: "1h", goodEvents: 5_999_100, totalEvents: 6_000_000, latencyP99Ms: 96 },
  { objectiveId: "critical-path-latency", window: "24h", goodEvents: 143_985_000, totalEvents: 144_000_000, latencyP99Ms: 98 },
  { objectiveId: "system-availability", window: "5m", goodEvents: 499_990, totalEvents: 500_000, latencyP99Ms: 64 },
  { objectiveId: "system-availability", window: "1h", goodEvents: 5_999_700, totalEvents: 6_000_000, latencyP99Ms: 70 },
  { objectiveId: "system-availability", window: "24h", goodEvents: 143_990_000, totalEvents: 144_000_000, latencyP99Ms: 76 },
];

function asPercent(value: number) {
  return `${(value * 100).toFixed(3)}%`;
}

export function SloMonitoringPanel() {
  const alerts = evaluateBurnRateAlerts(DEFAULT_SLO_OBJECTIVES, SAMPLE_MEASUREMENTS);

  return (
    <section className="rounded-2xl border border-border bg-background p-5 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Reliability command center</p>
          <h2 className="text-2xl font-bold tracking-tight">SLO monitoring & burn-rate alerts</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Tracks 99.99% availability and sub-100ms P99 latency with multi-window burn-rate policies for page, ticket, and watch alerts.
          </p>
        </div>
        <div className="rounded-full bg-emerald-500/10 px-3 py-1 text-sm font-medium text-emerald-700 dark:text-emerald-300">
          Blue-green ready
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {DEFAULT_SLO_OBJECTIVES.map((objective) => {
          const measurement = SAMPLE_MEASUREMENTS.find((item) => item.objectiveId === objective.id && item.window === objective.window);
          if (!measurement) return null;
          const compliance = calculateCompliance(measurement);
          const budgetRemaining = calculateErrorBudgetRemaining(objective, measurement);
          const burnRate = calculateBurnRate(objective, measurement);

          return (
            <article key={objective.id} className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-semibold">{objective.name}</h3>
                <span className="rounded-full bg-background px-2 py-1 text-xs text-muted-foreground">{objective.window}</span>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Compliance</dt>
                  <dd className="font-bold tabular-nums">{asPercent(compliance)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Budget left</dt>
                  <dd className="font-bold tabular-nums">{asPercent(budgetRemaining)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Burn rate</dt>
                  <dd className="font-bold tabular-nums">{burnRate.toFixed(2)}x</dd>
                </div>
              </dl>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: asPercent(budgetRemaining) }} />
              </div>
            </article>
          );
        })}
      </div>

      <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">Alert policy</h3>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {DEFAULT_BURN_RATE_THRESHOLDS.map((threshold) => (
              <li key={threshold.severity} className="flex justify-between gap-3">
                <span className="capitalize">{threshold.severity}</span>
                <span>{threshold.shortWindow} + {threshold.longWindow} at {threshold.multiplier}x</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-border p-4">
          <h3 className="font-semibold">Current alerts</h3>
          {alerts.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm">
              {alerts.map((alert) => (
                <li key={`${alert.objectiveId}-${alert.severity}`} className="rounded-lg bg-amber-500/10 px-3 py-2 text-amber-800 dark:text-amber-200">
                  {alert.message}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">No active burn-rate alerts.</p>
          )}
        </div>
      </div>
    </section>
  );
}
