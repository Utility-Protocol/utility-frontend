"use client";

import {
  CONSUMPTION_MAX_KWH,
  CONSUMPTION_MIN_KWH,
  type Groth16Proof,
  type MeterReading,
  type ZKCircuitInputs,
  type ZKProofResult,
  type ZKWorkerRequest,
  type ZKWorkerResponse,
} from "@/types/zk";
import { downloadKey, sha256Hex, type DownloadProgress } from "@/services/keyCache";

/**
 * Orchestrates anonymous meter-reading proofs: gathers and validates the
 * circuit inputs, ensures the proving key is cached, then drives the prover
 * web worker. The heavy WASM proving runs off the main thread; this service is
 * the thin coordination layer the React hook talks to.
 */

export interface ZKProverConfig {
  /** Compiled circuit WASM (witness generator). */
  wasmUrl: string;
  /** Groth16 proving key (`circuit_final.zkey`), CDN-hosted. */
  zkeyUrl: string;
  /** Expected SHA-256 of the zkey for integrity verification. */
  zkeySha256?: string;
}

export const DEFAULT_PROVER_CONFIG: ZKProverConfig = {
  wasmUrl: "/wasm/zk/circuit.wasm",
  zkeyUrl:
    process.env.NEXT_PUBLIC_ZK_ZKEY_URL ?? "/wasm/zk/circuit_final.zkey",
  zkeySha256: process.env.NEXT_PUBLIC_ZK_ZKEY_SHA256,
};

/** Context not derivable from the raw reading, supplied by the caller. */
export interface ProofContext {
  /** Membership tree root the meter belongs to (256-bit hex, 0x-prefixed). */
  merkleRoot: string;
  /** Recent ledger hash for replay protection (within last 10 ledgers, hex). */
  blockHash: string;
  /** x25519 ciphertext of the reading (512-bit hex). */
  encryptedCiphertext: string;
  /** Optional explicit salt (248-bit hex); a random one is generated if absent. */
  salt?: string;
}

export class ProverInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProverInputError";
  }
}

/** Convert a hex string (optionally 0x-prefixed) to a decimal field string. */
export function hexToFieldString(hex: string): string {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length === 0) {
    throw new ProverInputError(`Invalid hex value: ${hex}`);
  }
  return BigInt(`0x${clean}`).toString(10);
}

/** Cryptographically-random 248-bit salt as a 0x-prefixed hex string. */
export function generateSalt(): string {
  const bytes = new Uint8Array(31); // 248 bits
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `0x${hex}`;
}

/**
 * Validate a reading and assemble the full circuit witness. Field elements are
 * normalised to decimal strings; the timestamp stays numeric (32-bit). Throws
 * `ProverInputError` for out-of-range or malformed inputs before any expensive
 * key download or proving begins.
 */
export function prepareInputs(
  reading: MeterReading,
  context: ProofContext
): ZKCircuitInputs {
  if (!Number.isInteger(reading.consumption)) {
    throw new ProverInputError("consumption must be an integer kWh value");
  }
  if (
    reading.consumption < CONSUMPTION_MIN_KWH ||
    reading.consumption > CONSUMPTION_MAX_KWH
  ) {
    throw new ProverInputError(
      `consumption ${reading.consumption} kWh is outside the accepted range [${CONSUMPTION_MIN_KWH}, ${CONSUMPTION_MAX_KWH}]`
    );
  }
  if (!reading.meterId) {
    throw new ProverInputError("meterId is required");
  }

  const timestamp = reading.timestamp ?? Math.floor(Date.now() / 1000);
  if (!Number.isInteger(timestamp) || timestamp < 0 || timestamp > 0xffffffff) {
    throw new ProverInputError("timestamp must fit in 32 bits");
  }

  const salt = context.salt ?? generateSalt();

  return {
    // Private signals.
    meterId: hexToFieldString(reading.meterId),
    consumption: String(reading.consumption),
    salt: hexToFieldString(salt),
    // Public signals.
    merkleRoot: hexToFieldString(context.merkleRoot),
    encryptedCiphertext: context.encryptedCiphertext,
    timestamp,
    blockHash: hexToFieldString(context.blockHash),
  };
}

let workerCounter = 0;

export interface GenerateProofOptions {
  config?: ZKProverConfig;
  /** 0–100 progress while the ~150 MB proving key downloads. */
  onKeyProgress?: (p: DownloadProgress) => void;
  /** 0–100 progress while the worker proves. */
  onProveProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

/** Stable hash over the canonicalised proof, used as a client-side reference. */
async function hashProof(
  proof: Groth16Proof,
  publicSignals: string[]
): Promise<string> {
  const canonical = JSON.stringify({ proof, publicSignals });
  const bytes = new TextEncoder().encode(canonical);
  return sha256Hex(bytes.buffer);
}

/**
 * Ensure the proving key is cached, then run the Groth16 prover in a worker.
 * Resolves with the proof, public signals and a proof hash. The worker is
 * always terminated, and `signal` aborts both the key download and proving.
 */
export async function generateProof(
  inputs: ZKCircuitInputs,
  options: GenerateProofOptions = {}
): Promise<ZKProofResult> {
  const config = options.config ?? DEFAULT_PROVER_CONFIG;

  // 1. Cache / resume the proving key (verified by SHA-256).
  const zkey = await downloadKey(config.zkeyUrl, {
    expectedSha256: config.zkeySha256,
    onProgress: options.onKeyProgress,
    signal: options.signal,
  });

  // 2. Prove off the main thread.
  const worker = new Worker(
    new URL("../workers/zkProver.worker.ts", import.meta.url),
    { type: "module" }
  );
  const id = ++workerCounter;

  try {
    const { proof, publicSignals } = await new Promise<{
      proof: Groth16Proof;
      publicSignals: string[];
    }>((resolve, reject) => {
      const onAbort = () => {
        worker.terminate();
        reject(new DOMException("Aborted", "AbortError"));
      };
      if (options.signal?.aborted) return onAbort();
      options.signal?.addEventListener("abort", onAbort, { once: true });

      worker.onmessage = (e: MessageEvent<ZKWorkerResponse>) => {
        const msg = e.data;
        if (msg.id !== id) return;
        if (msg.type === "progress") {
          options.onProveProgress?.(msg.progress);
        } else if (msg.type === "result") {
          options.signal?.removeEventListener("abort", onAbort);
          resolve({ proof: msg.proof, publicSignals: msg.publicSignals });
        } else if (msg.type === "error") {
          options.signal?.removeEventListener("abort", onAbort);
          reject(new Error(msg.error));
        }
      };
      worker.onerror = (e: ErrorEvent) => {
        options.signal?.removeEventListener("abort", onAbort);
        reject(new Error(e.message || "Prover worker crashed"));
      };

      // Transfer the (large) zkey buffer to avoid a structured-clone copy.
      const request: ZKWorkerRequest = {
        id,
        type: "prove",
        inputs,
        wasmUrl: new URL(config.wasmUrl, self.location.href).href,
        zkey,
      };
      worker.postMessage(request, [zkey]);
    });

    const proofHash = await hashProof(proof, publicSignals);
    options.onProveProgress?.(100);
    return { proof, publicSignals, proofHash };
  } finally {
    worker.terminate();
  }
}
