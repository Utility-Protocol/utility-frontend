"use client";

import { useCallback, useRef, useState } from "react";
import type {
  MeterReading,
  ZKProofResult,
  ZKSubmissionState,
} from "@/types/zk";
import {
  generateProof,
  prepareInputs,
  type ProofContext,
  type ZKProverConfig,
} from "@/services/zkProver";
import { verifyProof } from "@/services/zkVerifier";
import { classifyError } from "@/utils/errors";

/**
 * Encrypted submission payload handed to the chain. The ciphertext and proof
 * are public; the plaintext reading and meter identity never leave the device.
 */
export interface EncryptedSubmission {
  encryptedReading: string;
  proof: ZKProofResult["proof"];
  publicSignals: string[];
  proofHash: string;
}

export interface UseZKSubmissionOptions {
  /** Soroban contract holding the verification key and accepting submissions. */
  contractId: string;
  network?: string;
  proverConfig?: ZKProverConfig;
  /**
   * Resolve the non-reading context for a submission: the membership root, a
   * recent block hash (replay protection) and the x25519 ciphertext.
   */
  buildContext: (reading: MeterReading) => Promise<ProofContext> | ProofContext;
  /**
   * Submit the encrypted payload on-chain. Should resolve once accepted into
   * the ledger. Defaults to a no-op so the hook can be used proof-only.
   */
  submitEncrypted?: (payload: EncryptedSubmission) => Promise<void>;
}

const INITIAL_STATE: ZKSubmissionState = {
  status: "idle",
  progress: 0,
  proofHash: null,
  error: null,
};

// Phase weighting across the overall 0–100 bar.
const KEY_PHASE_MAX = 55; // downloading-key occupies 0–55%.
const PROVE_PHASE_MAX = 90; // proving occupies 55–90%.

export interface UseZKSubmissionReturn {
  state: ZKSubmissionState;
  /** Run the full pipeline: prove → submit → verify. */
  submit: (reading: MeterReading) => Promise<void>;
  /** Verify an already-generated proof against the on-chain key. */
  verify: (
    proof: ZKProofResult["proof"],
    publicSignals: string[]
  ) => Promise<boolean>;
  /** Abort an in-flight submission (key download and proving). */
  cancel: () => void;
  reset: () => void;
}

export function useZKSubmission(
  options: UseZKSubmissionOptions
): UseZKSubmissionReturn {
  const [state, setState] = useState<ZKSubmissionState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    runningRef.current = false;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setState(INITIAL_STATE);
  }, [cancel]);

  const submit = useCallback(
    async (reading: MeterReading) => {
      if (runningRef.current) return; // Guard against double submission.
      runningRef.current = true;

      const controller = new AbortController();
      abortRef.current = controller;
      const { signal } = controller;

      setState({
        status: "downloading-key",
        progress: 0,
        proofHash: null,
        error: null,
      });

      try {
        const context = await options.buildContext(reading);
        const inputs = prepareInputs(reading, context);

        const result = await generateProof(inputs, {
          config: options.proverConfig,
          signal,
          onKeyProgress: (p) => {
            const pct = p.percent ?? 0;
            setState((s) => ({
              ...s,
              status: "downloading-key",
              progress: Math.round((pct / 100) * KEY_PHASE_MAX),
            }));
          },
          onProveProgress: (pct) => {
            setState((s) => ({
              ...s,
              status: "proving",
              progress:
                KEY_PHASE_MAX +
                Math.round((pct / 100) * (PROVE_PHASE_MAX - KEY_PHASE_MAX)),
            }));
          },
        });

        if (signal.aborted) return;

        // Submit the encrypted payload on-chain.
        setState((s) => ({
          ...s,
          status: "submitting",
          progress: PROVE_PHASE_MAX,
          proofHash: result.proofHash,
        }));

        await options.submitEncrypted?.({
          encryptedReading: context.encryptedCiphertext,
          proof: result.proof,
          publicSignals: result.publicSignals,
          proofHash: result.proofHash,
        });

        if (signal.aborted) return;

        // Independently verify against the on-chain verification key.
        const ok = await verifyProof(result.proof, result.publicSignals, {
          contractId: options.contractId,
          network: options.network,
        });

        setState({
          status: ok ? "confirmed" : "rejected",
          progress: 100,
          proofHash: result.proofHash,
          error: ok ? null : "Proof failed on-chain verification.",
        });
      } catch (err) {
        if ((err as Error)?.name === "AbortError" || signal.aborted) {
          setState(INITIAL_STATE);
          return;
        }
        setState((s) => ({
          ...s,
          status: "rejected",
          error: classifyError(err).message,
        }));
      } finally {
        runningRef.current = false;
        abortRef.current = null;
      }
    },
    [options]
  );

  const verify = useCallback(
    (proof: ZKProofResult["proof"], publicSignals: string[]) =>
      verifyProof(proof, publicSignals, {
        contractId: options.contractId,
        network: options.network,
      }),
    [options.contractId, options.network]
  );

  return { state, submit, verify, cancel, reset };
}
