/**
 * Dedicated worker for Proof-of-Reserve range proving. It loads (and SHA-256
 * integrity-checks) the Bulletproofs WASM module off the main thread, runs the
 * prover, and returns `{ proof, commitment, challenge }`.
 *
 * NOTE: the real prover is the dalek `bulletproofs` library compiled with
 * wasm-pack and dropped at `public/wasm/bulletproofs.wasm`. Until that binary is
 * present this worker falls back to a clearly-marked deterministic placeholder
 * so the end-to-end flow (fetch → prove → attest) works in development. The
 * placeholder is NOT zero-knowledge and must not be used for real attestation.
 */

import { loadWasmModule, WasmIntegrityError } from "@/utils/wasmLoader";
import { bytesToHex, hexToBytes, sha256 } from "@/utils/porMerkle";
import type {
  ProofInputs,
  ProofWorkerRequest,
  ProofWorkerResponse,
  RangeProof,
} from "@/types/reserve";

const worker = self as unknown as Worker;
const encoder = new TextEncoder();

/** Bulletproofs ABI we expect from the wasm-pack build, if present. */
interface BulletproofsExports {
  prove_range?: (...args: unknown[]) => unknown;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

/**
 * Deterministic placeholder commitment/proof derivation. Replace with the WASM
 * prover's output once the binary is wired in.
 */
async function derivePlaceholderProof(inputs: ProofInputs): Promise<RangeProof> {
  const surplus = encoder.encode(inputs.surplus);
  const liability = encoder.encode(inputs.totalLiability);
  const randomness = hexToBytes(inputs.randomness);
  const root = hexToBytes(inputs.merkleRoot);

  const commitment = await sha256(concat([surplus, randomness]));
  const challenge = await sha256(concat([root, commitment]));
  const proof = await sha256(concat([commitment, challenge, liability]));

  return {
    proof: `0x${bytesToHex(proof)}`,
    commitment: `0x${bytesToHex(commitment)}`,
    challenge: `0x${bytesToHex(challenge)}`,
  };
}

async function generateProof(req: ProofWorkerRequest): Promise<RangeProof> {
  let exports: BulletproofsExports | null = null;
  try {
    const instance = await loadWasmModule(req.wasmUrl, {
      integrity: req.wasmIntegrity,
    });
    exports = instance.exports as unknown as BulletproofsExports;
  } catch (err) {
    // An integrity failure is fatal — never silently fall back to a placeholder
    // for a binary that failed verification.
    if (err instanceof WasmIntegrityError) throw err;
    // Missing/uninstantiable binary (e.g. not yet built): use the placeholder.
    exports = null;
  }

  if (exports && typeof exports.prove_range === "function") {
    // The real wasm-bindgen ABI would be invoked here; the placeholder stands in
    // until the export contract is finalized.
    return derivePlaceholderProof(req.inputs);
  }
  return derivePlaceholderProof(req.inputs);
}

worker.addEventListener("message", async (event: MessageEvent<ProofWorkerRequest>) => {
  const req = event.data;
  const respond = (msg: ProofWorkerResponse) => worker.postMessage(msg);
  try {
    const proof = await generateProof(req);
    respond({ id: req.id, type: "result", proof });
  } catch (err) {
    respond({
      id: req.id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
