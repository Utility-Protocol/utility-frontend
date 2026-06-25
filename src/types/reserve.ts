/**
 * Types and invariants for the cryptographic Proof-of-Reserve (PoR) module.
 *
 * The operator proves that on-chain liabilities (tokenized utility credits) are
 * fully backed by off-chain audited resources, without revealing individual
 * meter readings. A Merkle-summary commitment is read from Soroban storage, the
 * audited inventory is fetched over REST, and a Bulletproofs-style range proof
 * shows the off-chain surplus is non-negative and fits in 64 bits.
 */

/** Merkle tree depth — up to 2^20 (1,048,576) meter endpoints. */
export const MERKLE_DEPTH = 20;
export const MAX_LEAVES = 2 ** MERKLE_DEPTH;

/** Range proof covers [0, 2^64) with a 64-bit commitment. */
export const RANGE_BITS = 64;
export const RANGE_MAX = (BigInt(1) << BigInt(64)) - BigInt(1);

/** WASM prover budget. */
export const WASM_MAX_GZIP_BYTES = 2 * 1024 * 1024;
export const PROOF_TIME_BUDGET_MS = 5_000;

/** On-chain commitment read from the Soroban contract. */
export interface OnChainCommitment {
  /** Merkle root, 0x-prefixed 32-byte hex. */
  merkleRoot: string;
  /** Total liability (contract i128), as a decimal string. */
  totalLiability: string;
  /** Ledger number of the last on-chain audit. */
  lastAuditLedger: number;
}

/** A single audited resource class from the off-chain inventory. */
export interface AuditEntry {
  resourceClass: string;
  /** Cumulative consumption, decimal string. */
  total: string;
}

/** Response of GET /api/resources/audit. */
export interface AuditInventory {
  entries: AuditEntry[];
  /** Server-signed unix-seconds timestamp. */
  serverTimestamp: number;
  /** Detached signature over the response (base64 / hex). */
  signature: string;
}

/** Inputs handed to the WASM prover. */
export interface ProofInputs {
  /** 0x-prefixed Merkle root hex. */
  merkleRoot: string;
  /** On-chain liability (decimal string). */
  totalLiability: string;
  /** Off-chain audited total (decimal string). */
  auditTotal: string;
  /** Surplus = auditTotal − totalLiability (decimal string, ≥ 0). */
  surplus: string;
  /** Blinding factor, 0x-prefixed hex. */
  randomness: string;
}

/** Output of the range prover. */
export interface RangeProof {
  /** Proof bytes, 0x-prefixed hex. */
  proof: string;
  /** Pedersen commitment to the surplus, 0x-prefixed hex. */
  commitment: string;
  /** Fiat-Shamir challenge, 0x-prefixed hex. */
  challenge: string;
}

/** Final attestation result surfaced to the UI. */
export interface AttestationResult {
  /** SHA-256 of the proof, used as the attestation reference. */
  attestationHash: string;
  /** Ledger / block number the attestation landed in, if confirmed. */
  ledger: number | null;
  commitment: string;
  /** When the proof was produced (unix ms). */
  provedAt: number;
}

export type ProofStatus =
  | "idle"
  | "fetching"
  | "proving"
  | "submitting"
  | "confirmed"
  | "insolvent"
  | "error";

export interface ProofState {
  status: ProofStatus;
  /** 0–100. */
  progress: number;
  result: AttestationResult | null;
  /** Set when the off-chain total is below the on-chain liability. */
  insolvency: InsolvencyReport | null;
  error: string | null;
}

/** Details surfaced when reserves do not cover liabilities. */
export interface InsolvencyReport {
  liability: string;
  auditTotal: string;
  /** Negative shortfall (decimal string). */
  shortfall: string;
}

/** Worker protocol. */
export interface ProofWorkerRequest {
  id: number;
  inputs: ProofInputs;
  wasmUrl: string;
  wasmIntegrity?: string;
}

export type ProofWorkerResponse =
  | { id: number; type: "result"; proof: RangeProof }
  | { id: number; type: "error"; error: string };
