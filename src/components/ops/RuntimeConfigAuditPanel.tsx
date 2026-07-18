import { createRuntimeConfigAudit } from "@/services/runtimeConfigAudit";

const demoAudit = createRuntimeConfigAudit(
  {
    NEXT_PUBLIC_CHAIN_NETWORK: "testnet",
    NEXT_PUBLIC_TELEMETRY_MODE: "streaming",
    NEXT_PUBLIC_EXPORT_FORMAT: "csv",
    NEXT_PUBLIC_CANARY_PERCENT: "10",
  },
  "2026-07-18T00:00:00.000Z",
  "dashboard-preview"
);

export function RuntimeConfigAuditPanel() {
  const criticalLabel = demoAudit.summary.critical === 0 ? "No critical drift" : `${demoAudit.summary.critical} critical drift`;

  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Runtime config audit</p>
          <h3 className="mt-1 text-lg font-semibold">Drift detection</h3>
        </div>
        <span className="rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
          {criticalLabel}
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-muted-foreground">Checked</p>
          <p className="text-xl font-bold">{demoAudit.summary.checked}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Drifted</p>
          <p className="text-xl font-bold">{demoAudit.summary.drifted}</p>
        </div>
        <div>
          <p className="text-muted-foreground">P99 budget</p>
          <p className="text-xl font-bold">&lt;100ms</p>
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm">
        {demoAudit.drifts.map((drift) => (
          <li key={drift.key} className="rounded-lg border border-border p-3">
            <span className="font-medium">{drift.service}</span>: {drift.key} expected {String(drift.expected)} but saw {String(drift.actual)}.
          </li>
        ))}
      </ul>
    </div>
  );
}
