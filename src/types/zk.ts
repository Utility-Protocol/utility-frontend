/**
 * Shared types for the anonymous meter-reading zero-knowledge proof module.
 *
 * Proof system: Groth16 over BLS12-381, compiled via circom + snarkjs to WASM.
 * The circuit proves that an encrypted meter reading is within an acceptable
 * range and originates from a registered meter, without revealing the reading
 * or the meter identity.
 */

/** Acceptable consumption range enforced by the circuit's RangeCheck gadget. */
export const CONSUMPTION_MIN_KWH = 0;
export const CONSUMPTION_MAX_KWH = 10_000;

/** A recent block hash must fall within this many ledgers to be accepted. */
export const FRESHNESS_LEDGER_WINDOW = 10;

/**
 * Private signals — never leave the prover. Field elements are passed to
 * snarkjs as decimal strings to avoid precision loss above 2^53.
 */
export interface ZKPrivateInputs {
  /** Registered meter identifier (248-bit field element, decimal string). */
  meterId: string;
  /** Consumption reading in kWh (64-bit, decimal string). */
  consumption: string;
  /** Per-submission random salt (248-bit field element, decimal string). */
  salt: string;
}

/**
 * Public signals — disclosed alongside the proof and bound into verification.
 */
export interface ZKPublicInputs {
  /** Membership tree root the meter must belong to (256-bit hex). */
  merkleRoot: string;
  /** x25519 ciphertext of the reading (512-bit hex). */
  encryptedCiphertext: string;
  /** Reading timestamp, unix seconds (32-bit). */
  timestamp: number;
  /** Recent ledger hash for replay protection (within last 10 ledgers). */
  blockHash: string;
}

/** Full circuit witness input handed to the worker. */
export interface ZKCircuitInputs extends ZKPrivateInputs, ZKPublicInputs {}

/** Raw groth16 proof as returned by snarkjs. */
export interface Groth16Proof {
  pi_a: string[];
  pi_b: string[][];
  pi_c: string[];
  protocol: "groth16";
  curve: "bls12381";
}

/** Output of a successful proving run. */
export interface ZKProofResult {
  proof: Groth16Proof;
  /** Public signals in circuit declaration order, as decimal strings. */
  publicSignals: string[];
  /** SHA-256 of the canonicalised proof, used as a client-side reference. */
  proofHash: string;
}

/** snarkjs Groth16 verification key (subset of fields we rely on). */
export interface Groth16VerificationKey {
  protocol: "groth16";
  curve: "bls12381";
  nPublic: number;
  vk_alpha_1: string[];
  vk_beta_2: string[][];
  vk_gamma_2: string[][];
  vk_delta_2: string[][];
  IC: string[][];
}

/** Lifecycle phases surfaced to the UI stepper. */
export type ZKSubmissionStatus =
  | "idle"
  | "downloading-key"
  | "proving"
  | "submitting"
  | "confirmed"
  | "rejected";

export interface ZKSubmissionState {
  status: ZKSubmissionStatus;
  /** 0–100 overall progress across the active phase. */
  progress: number;
  /** SHA-256 reference of the generated proof, once available. */
  proofHash: string | null;
  /** Human-readable error if the run was rejected. */
  error: string | null;
}

/** A plaintext meter reading submitted by a field operator. */
export interface MeterReading {
  meterId: string;
  consumption: number;
  /** Unix seconds; defaults to the current time when omitted. */
  timestamp?: number;
}

/** Messages exchanged with the prover web worker. */
export type ZKWorkerRequest = {
  id: number;
  type: "prove";
  inputs: ZKCircuitInputs;
  wasmUrl: string;
  /** The cached proving key bytes, transferred to the worker. */
  zkey: ArrayBuffer;
};

export type ZKWorkerResponse =
  | {
      id: number;
      type: "progress";
      /** 0–100 within the proving phase. */
      progress: number;
    }
  | {
      id: number;
      type: "result";
      proof: Groth16Proof;
      publicSignals: string[];
    }
  | {
      id: number;
      type: "error";
      error: string;
    };
