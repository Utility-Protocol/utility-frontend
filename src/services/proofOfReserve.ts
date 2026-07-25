"use client";

import {
  RANGE_MAX,
  type AuditInventory,
  type AttestationResult,
  type InsolvencyReport,
  type OnChainCommitment,
  type ProofInputs,
  type ProofWorkerRequest,
  type ProofWorkerResponse,
  type RangeProof,
} from "@/types/reserve";
import { bytesToHex, hexToBytes, sha256 } from "@/utils/porMerkle";
import { getTracer } from "@/utils/telemetry/tracing";

/**
 * Proof-of-Reserve orchestrator. Reads the on-chain Merkle/liability commitment
 * and the off-chain audited inventory, aborts on insolvency, then drives the
 * WASM range prover and (optionally) submits the attestation on-chain. All I/O
 * is injectable so the flow can be exercised without a contract or WASM module.
 */

export interface ProofOfReserveConfig {
  contractId: string;
  network?: string;
  /** Audit window start (unix seconds). */
  from: number;
  /** Audit window end (unix seconds). */
  to: number;
}

export interface ProofOfReserveDeps {
  fetchCommitment?: (
    contractId: string,
    network: string
  ) => Promise<OnChainCommitment>;
  fetchAudit?: (
    from: number,
    to: number,
    network: string
  ) => Promise<AuditInventory>;
  /** Range prover; defaults to the WASM worker. */
  prove?: (inputs: ProofInputs) => Promise<RangeProof>;
  /** Submit the attestation; when omitted the proof is produced but not sent. */
  submitAttestation?: (
    proof: RangeProof,
    attestationHash: string,
    config: ProofOfReserveConfig
  ) => Promise<{ ledger: number | null }>;
  fetchFn?: typeof fetch;
  apiBase?: string;
  wasmUrl?: string;
  wasmIntegrity?: string;
}

export type ProgressPhase =
  | "fetching"
  | "proving"
  | "submitting"
  | "confirmed";

export type ProgressFn = (phase: ProgressPhase, percent: number) => void;

/** Thrown when off-chain reserves do not cover the on-chain liability. */
export class InsolvencyError extends Error {
  constructor(readonly report: InsolvencyReport) {
    super(
      `Insolvency detected: reserves ${report.auditTotal} < liability ${report.liability} (shortfall ${report.shortfall})`
    );
    this.name = "InsolvencyError";
  }
}

/** Sum the audited inventory totals as an integer. */
export function aggregateAudit(inventory: AuditInventory): bigint {
  return inventory.entries.reduce((acc, e) => acc + BigInt(e.total), BigInt(0));
}

/** Return an insolvency report when reserves < liability, else null. */
export function checkSolvency(
  liability: bigint,
  auditTotal: bigint
): InsolvencyReport | null {
  if (auditTotal >= liability) return null;
  return {
    liability: liability.toString(),
    auditTotal: auditTotal.toString(),
    shortfall: (auditTotal - liability).toString(),
  };
}

/** Cryptographically-random 32-byte blinding factor as 0x-hex. */
export function generateRandomness(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${bytesToHex(bytes)}`;
}

/** Assemble the prover inputs; throws if the surplus exceeds the 64-bit range. */
export function buildProofInputs(
  commitment: OnChainCommitment,
  auditTotal: bigint
): ProofInputs {
  const liability = BigInt(commitment.totalLiability);
  const surplus = auditTotal - liability;
  if (surplus < BigInt(0)) {
    throw new Error("surplus is negative — solvency must be checked first");
  }
  if (surplus > RANGE_MAX) {
    throw new Error(`surplus ${surplus} exceeds the 64-bit range proof bound`);
  }
  return {
    merkleRoot: commitment.merkleRoot,
    totalLiability: liability.toString(),
    auditTotal: auditTotal.toString(),
    surplus: surplus.toString(),
    randomness: generateRandomness(),
  };
}

/** SHA-256 of the proof bytes, used as the attestation reference. */
export async function attestationHashOf(proof: RangeProof): Promise<string> {
  return `0x${bytesToHex(await sha256(hexToBytes(proof.proof)))}`;
}

let workerCounter = 0;

/** Default prover: run the Bulletproofs WASM in a dedicated worker. */
export function proveWithWorker(
  inputs: ProofInputs,
  options: { wasmUrl: string; wasmIntegrity?: string; signal?: AbortSignal } = {
    wasmUrl: "/wasm/bulletproofs.wasm",
  }
): Promise<RangeProof> {
  const worker = new Worker(
    new URL("../workers/proofWorker.worker.ts", import.meta.url),
    { type: "module" }
  );
  const id = ++workerCounter;

  return new Promise<RangeProof>((resolve, reject) => {
    const cleanup = () => worker.terminate();
    const onAbort = () => {
      cleanup();
      reject(new DOMException("Aborted", "AbortError"));
    };
    if (options.signal?.aborted) return onAbort();
    options.signal?.addEventListener("abort", onAbort, { once: true });

    worker.onmessage = (e: MessageEvent<ProofWorkerResponse>) => {
      const msg = e.data;
      if (msg.id !== id) return;
      options.signal?.removeEventListener("abort", onAbort);
      cleanup();
      if (msg.type === "result") resolve(msg.proof);
      else reject(new Error(msg.error));
    };
    worker.onerror = (e: ErrorEvent) => {
      cleanup();
      reject(new Error(e.message || "Proof worker crashed"));
    };

    const request: ProofWorkerRequest = {
      id,
      inputs,
      wasmUrl: options.wasmUrl,
      wasmIntegrity: options.wasmIntegrity,
    };
    worker.postMessage(request);
  });
}

const defaultFetchCommitment = (): Promise<OnChainCommitment> => {
  throw new Error("fetchCommitment dependency is required");
};

function makeFetchAudit(
  deps: ProofOfReserveDeps
): NonNullable<ProofOfReserveDeps["fetchAudit"]> {
  if (deps.fetchAudit) return deps.fetchAudit;
  const fetchFn = deps.fetchFn ?? fetch.bind(globalThis);
  const apiBase = deps.apiBase ?? "/api/resources";
  return async (from, to) => {
    const res = await fetchFn(`${apiBase}/audit?from=${from}&to=${to}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Audit request failed: HTTP ${res.status}`);
    return (await res.json()) as AuditInventory;
  };
}

export interface ProofOfReserveOutcome {
  proof: RangeProof;
  result: AttestationResult;
  commitment: OnChainCommitment;
  auditTotal: string;
}

/**
 * Run the full PoR flow. Emits progress (fetch → prove → submit → confirm) and
 * throws {@link InsolvencyError} when reserves do not cover liabilities.
 */
export async function runProofOfReserve(
  config: ProofOfReserveConfig,
  deps: ProofOfReserveDeps = {},
  onProgress: ProgressFn = () => {}
): Promise<ProofOfReserveOutcome> {
  const tracer = getTracer();
  const span = tracer.startSpan("runProofOfReserve");
  span.setAttributes({
    "por.contract_id": config.contractId,
    "por.from": config.from,
    "por.to": config.to,
    "por.network": config.network ?? "testnet",
  });

  return tracer.withSpanAsync(span, async () => {
    try {
      const network = config.network ?? "testnet";
      const fetchCommitment = deps.fetchCommitment ?? defaultFetchCommitment;
      const fetchAudit = makeFetchAudit(deps);
      const prove =
        deps.prove ??
        ((inputs: ProofInputs) =>
          proveWithWorker(inputs, {
            wasmUrl: deps.wasmUrl ?? "/wasm/bulletproofs.wasm",
            wasmIntegrity: deps.wasmIntegrity,
          }));

      // 1. Fetch on-chain commitment and off-chain inventory.
      onProgress("fetching", 10);
      const [commitment, inventory] = await Promise.all([
        fetchCommitment(config.contractId, network),
        fetchAudit(config.from, config.to, network),
      ]);
      onProgress("fetching", 25);

      // 2. Solvency gate.
      const auditTotal = aggregateAudit(inventory);
      const liability = BigInt(commitment.totalLiability);
      const insolvency = checkSolvency(liability, auditTotal);
      if (insolvency) throw new InsolvencyError(insolvency);

      // 3. Prove the surplus is in range.
      const inputs = buildProofInputs(commitment, auditTotal);
      onProgress("proving", 50);
      const proof = await prove(inputs);

      // 4. Attest on-chain (optional).
      const attestationHash = await attestationHashOf(proof);
      onProgress("submitting", 75);
      let ledger: number | null = null;
      if (deps.submitAttestation) {
        ({ ledger } = await deps.submitAttestation(proof, attestationHash, config));
      }

      onProgress("confirmed", 100);
      span.setStatus("OK");
      return {
        proof,
        commitment,
        auditTotal: auditTotal.toString(),
        result: {
          attestationHash,
          ledger,
          commitment: proof.commitment,
          provedAt: Date.now(),
        },
      };
    } catch (err) {
      span.recordException(err as Error);
      throw err;
    } finally {
      span.end();
    }
  });
}
