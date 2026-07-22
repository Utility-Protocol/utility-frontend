"use client";

import { useMemo, useState } from "react";
import type { MeterReading, ZKSubmissionStatus } from "@/types/zk";
import { CONSUMPTION_MAX_KWH, CONSUMPTION_MIN_KWH } from "@/types/zk";
import {
  useZKSubmission,
  type UseZKSubmissionOptions,
} from "@/hooks/useZKSubmission";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

/**
 * UI panel for submitting an encrypted meter reading together with a Groth16
 * zero-knowledge proof. The reading and meter identity never leave the device;
 * only the ciphertext, proof and public signals are sent on-chain. A stepper
 * surfaces each phase: key download → proving → submitting → verification.
 */

export interface ZKSubmissionPanelProps
  extends Omit<UseZKSubmissionOptions, "buildContext"> {
  buildContext: UseZKSubmissionOptions["buildContext"];
  className?: string;
}

interface Step {
  key: Exclude<ZKSubmissionStatus, "idle">;
  label: string;
}

const STEPS: Step[] = [
  { key: "downloading-key", label: "Cache proving key" },
  { key: "proving", label: "Generate proof" },
  { key: "submitting", label: "Submit encrypted" },
  { key: "confirmed", label: "Verify on-chain" },
];

/** Index of the step a given status belongs to (rejected maps to the last). */
function statusToStepIndex(status: ZKSubmissionStatus): number {
  switch (status) {
    case "downloading-key":
      return 0;
    case "proving":
      return 1;
    case "submitting":
      return 2;
    case "confirmed":
    case "rejected":
      return 3;
    default:
      return -1;
  }
}

export function ZKSubmissionPanel({
  className,
  buildContext,
  ...options
}: ZKSubmissionPanelProps) {
  const { flags } = useFeatureFlags();
  const { state, submit, cancel, reset } = useZKSubmission({
    ...options,
    buildContext,
  });

  const [meterId, setMeterId] = useState("");
  const [consumption, setConsumption] = useState("");

  const activeIndex = statusToStepIndex(state.status);
  const busy =
    state.status === "downloading-key" ||
    state.status === "proving" ||
    state.status === "submitting";

  const consumptionError = useMemo(() => {
    if (consumption === "") return null;
    const n = Number(consumption);
    if (!Number.isInteger(n)) return "Enter a whole number of kWh.";
    if (n < CONSUMPTION_MIN_KWH || n > CONSUMPTION_MAX_KWH) {
      return `Must be between ${CONSUMPTION_MIN_KWH} and ${CONSUMPTION_MAX_KWH} kWh.`;
    }
    return null;
  }, [consumption]);

  const canSubmit =
    !busy &&
    meterId.trim() !== "" &&
    consumption !== "" &&
    !consumptionError &&
    flags.heavyWeightTasks;

  const handleSubmit = () => {
    const reading: MeterReading = {
      meterId: meterId.trim(),
      consumption: Number(consumption),
    };
    void submit(reading);
  };

  return (
    <div
      className={`rounded-xl border border-border bg-background p-6 space-y-6 ${
        className ?? ""
      }`}
    >
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Anonymous Meter Submission</h3>
        <p className="text-sm text-muted-foreground">
          Your reading is encrypted and proven within range without revealing
          the value or meter identity.
        </p>
      </div>

      {!flags.heavyWeightTasks && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500 animate-pulse">
          ⚠️ <strong>Capacity Shedding Active:</strong> Proving tasks are temporarily disabled. range proof generations (Groth16 ZK) are disabled to protect system P99 response times.
        </div>
      )}

      {/* Input form */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Meter ID</span>
          <input
            value={meterId}
            onChange={(e) => setMeterId(e.target.value)}
            disabled={busy}
            placeholder="0x…"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Consumption (kWh)</span>
          <input
            value={consumption}
            onChange={(e) => setConsumption(e.target.value)}
            disabled={busy}
            inputMode="numeric"
            placeholder="0 – 10000"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          />
          {consumptionError && (
            <span className="text-xs text-red-500">{consumptionError}</span>
          )}
        </label>
      </div>

      {/* Stepper */}
      <ol className="space-y-3">
        {STEPS.map((step, i) => {
          const done = activeIndex > i || state.status === "confirmed";
          const active = activeIndex === i && busy;
          const failed = state.status === "rejected" && i === STEPS.length - 1;
          return (
            <li key={step.key} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={[
                  "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors",
                  failed
                    ? "border-red-500 bg-red-500/10 text-red-500"
                    : done
                    ? "border-green-500 bg-green-500/10 text-green-500"
                    : active
                    ? "border-ring bg-accent text-foreground animate-pulse"
                    : "border-border text-muted-foreground",
                ].join(" ")}
              >
                {failed ? "✕" : done ? "✓" : i + 1}
              </span>
              <span
                className={`text-sm ${
                  active || done ? "font-medium" : "text-muted-foreground"
                }`}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Progress bar */}
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={state.progress}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full transition-all duration-300 ${
            state.status === "rejected" ? "bg-red-500" : "bg-green-500"
          }`}
          style={{ width: `${state.progress}%` }}
        />
      </div>

      {/* Status line */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {state.status === "idle"
            ? "Ready"
            : state.status === "confirmed"
            ? "Proof verified and submitted."
            : state.status === "rejected"
            ? state.error ?? "Submission rejected."
            : `${STEPS[activeIndex]?.label ?? "Working"}… ${state.progress}%`}
        </span>
        {state.proofHash && (
          <code className="text-xs text-muted-foreground" title={state.proofHash}>
            {state.proofHash.slice(0, 10)}…
          </code>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        {busy ? (
          <button
            onClick={cancel}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Cancel
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate &amp; Submit
          </button>
        )}
        {(state.status === "confirmed" || state.status === "rejected") && (
          <button
            onClick={reset}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            New Submission
          </button>
        )}
      </div>
    </div>
  );
}

export default ZKSubmissionPanel;
