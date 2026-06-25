"use client";

import { useMemo } from "react";
import {
  useProofOfReserve,
  type UseProofOfReserveResult,
} from "@/hooks/useProofOfReserve";
import type { ProofOfReserveConfig, ProofOfReserveDeps } from "@/services/proofOfReserve";
import type { ProofStatus } from "@/types/reserve";

/**
 * Panel showing the latest Proof-of-Reserve attestation: proof hash, ledger,
 * time since the last proof, and a red banner when insolvency is detected.
 */

export interface ReserveAttestationPanelProps {
  config: ProofOfReserveConfig;
  deps?: ProofOfReserveDeps;
  /** Override the hook (testing). */
  controller?: UseProofOfReserveResult;
  className?: string;
}

const STATUS_LABEL: Record<ProofStatus, string> = {
  idle: "No attestation yet",
  fetching: "Fetching commitment & inventory…",
  proving: "Generating range proof…",
  submitting: "Submitting attestation…",
  confirmed: "Attested",
  insolvent: "Insolvency detected",
  error: "Proof failed",
};

function timeSince(ms: number): string {
  const secs = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ago`;
}

function shortHash(hex: string): string {
  return hex.length > 14 ? `${hex.slice(0, 10)}…${hex.slice(-4)}` : hex;
}

export function ReserveAttestationPanel({
  config,
  deps,
  controller,
  className,
}: ReserveAttestationPanelProps) {
  const internal = useProofOfReserve(deps);
  const { state, generate, reset } = controller ?? internal;

  const busy =
    state.status === "fetching" ||
    state.status === "proving" ||
    state.status === "submitting";

  const sinceLabel = useMemo(
    () => (state.result ? timeSince(state.result.provedAt) : null),
    [state.result]
  );

  return (
    <div
      className={`rounded-xl border border-border bg-background p-6 space-y-5 ${
        className ?? ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">Proof of Reserve</h3>
          <p className="text-sm text-muted-foreground">
            Cryptographic attestation that reserves back on-chain liabilities.
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            state.status === "confirmed"
              ? "bg-green-500/10 text-green-600"
              : state.status === "insolvent" || state.status === "error"
              ? "bg-red-500/10 text-red-600"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {STATUS_LABEL[state.status]}
        </span>
      </div>

      {/* Insolvency banner */}
      {state.insolvency && (
        <div
          role="alert"
          className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-600"
        >
          <p className="font-semibold">Reserves do not cover liabilities.</p>
          <p className="mt-1 font-mono text-xs">
            reserves {state.insolvency.auditTotal} &lt; liability{" "}
            {state.insolvency.liability} (shortfall {state.insolvency.shortfall})
          </p>
        </div>
      )}

      {/* Progress */}
      {state.status !== "idle" && !state.insolvency && (
        <div className="space-y-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={state.progress} aria-valuemin={0} aria-valuemax={100}>
            <div
              className={`h-full transition-all duration-300 ${
                state.status === "error" ? "bg-red-500" : "bg-green-500"
              }`}
              style={{ width: `${state.progress}%` }}
            />
          </div>
          {state.error && state.status === "error" && (
            <p className="text-xs text-red-500">{state.error}</p>
          )}
        </div>
      )}

      {/* Attestation detail */}
      {state.result && (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Attestation hash</dt>
          <dd className="text-right font-mono" title={state.result.attestationHash}>
            {shortHash(state.result.attestationHash)}
          </dd>
          <dt className="text-muted-foreground">Ledger</dt>
          <dd className="text-right font-mono">
            {state.result.ledger ?? "—"}
          </dd>
          <dt className="text-muted-foreground">Last proof</dt>
          <dd className="text-right">{sinceLabel}</dd>
        </dl>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => void generate(config)}
          disabled={busy}
          className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {busy ? "Working…" : "Generate attestation"}
        </button>
        {(state.status === "confirmed" ||
          state.status === "insolvent" ||
          state.status === "error") && (
          <button
            onClick={reset}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

export default ReserveAttestationPanel;
