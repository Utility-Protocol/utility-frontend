"use client";

import { useCallback, useRef, useState } from "react";
import {
  InsolvencyError,
  runProofOfReserve,
  type ProofOfReserveConfig,
  type ProofOfReserveDeps,
  type ProgressPhase,
} from "@/services/proofOfReserve";
import type { ProofState, ProofStatus } from "@/types/reserve";

/**
 * React hook wrapping the Proof-of-Reserve flow. Exposes status, 0–100 progress
 * and the attestation result, mapping the orchestrator's progress phases
 * (fetch 25 → prove 50 → submit 75 → confirm 100) and surfacing an insolvency
 * report when reserves fall short.
 */

const INITIAL_STATE: ProofState = {
  status: "idle",
  progress: 0,
  result: null,
  insolvency: null,
  error: null,
};

const PHASE_STATUS: Record<ProgressPhase, ProofStatus> = {
  fetching: "fetching",
  proving: "proving",
  submitting: "submitting",
  confirmed: "confirmed",
};

export interface UseProofOfReserveResult {
  state: ProofState;
  /** Run the proof flow for the given config. */
  generate: (config: ProofOfReserveConfig) => Promise<void>;
  reset: () => void;
}

export function useProofOfReserve(
  deps?: ProofOfReserveDeps
): UseProofOfReserveResult {
  const [state, setState] = useState<ProofState>(INITIAL_STATE);
  const runningRef = useRef(false);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const reset = useCallback(() => setState(INITIAL_STATE), []);

  const generate = useCallback(async (config: ProofOfReserveConfig) => {
    if (runningRef.current) return;
    runningRef.current = true;
    setState({ ...INITIAL_STATE, status: "fetching", progress: 5 });

    try {
      const outcome = await runProofOfReserve(
        config,
        depsRef.current ?? {},
        (phase, percent) => {
          setState((s) => ({ ...s, status: PHASE_STATUS[phase], progress: percent }));
        }
      );
      setState({
        status: "confirmed",
        progress: 100,
        result: outcome.result,
        insolvency: null,
        error: null,
      });
    } catch (err) {
      if (err instanceof InsolvencyError) {
        setState({
          status: "insolvent",
          progress: 100,
          result: null,
          insolvency: err.report,
          error: err.message,
        });
      } else if ((err as Error)?.name === "AbortError") {
        setState(INITIAL_STATE);
      } else {
        setState((s) => ({
          ...s,
          status: "error",
          error: (err as Error).message,
        }));
      }
    } finally {
      runningRef.current = false;
    }
  }, []);

  return { state, generate, reset };
}
