/**
 * Web Worker that runs the Groth16 (BLS12-381) prover off the main thread so a
 * ~30 s proving run never blocks the field tablet's UI. It receives the circuit
 * inputs, WASM circuit URL and the cached proving-key bytes, builds the witness
 * via snarkjs and returns `{ proof, publicSignals }`.
 *
 * snarkjs is loaded lazily. It is intentionally NOT a build-time dependency
 * (the package and its WASM are large and the zkey is CDN-hosted), so we resolve
 * it at runtime from the bundler-provided global, a local module, or an ESM CDN.
 */

import type { ZKWorkerRequest, ZKWorkerResponse, Groth16Proof } from "../types/zk";

interface SnarkjsLike {
  groth16: {
    fullProve: (
      input: Record<string, unknown>,
      wasmFile: string | { type: "mem"; data: Uint8Array },
      zkeyFile: string | { type: "mem"; data: Uint8Array }
    ) => Promise<{ proof: Groth16Proof; publicSignals: string[] }>;
  };
}

const worker = self as unknown as Worker & {
  snarkjs?: SnarkjsLike;
};

const SNARKJS_CDN = "https://cdn.jsdelivr.net/npm/snarkjs@0.7.5/+esm";

let snarkjsPromise: Promise<SnarkjsLike> | null = null;

async function loadSnarkjs(): Promise<SnarkjsLike> {
  if (worker.snarkjs) return worker.snarkjs;
  if (snarkjsPromise) return snarkjsPromise;

  snarkjsPromise = (async () => {
    // Prefer a locally-installed module if the bundler provides one, then fall
    // back to the pinned ESM CDN build. The dynamic specifier keeps the bundler
    // from trying to resolve an optional dependency at build time.
    const candidates = ["snarkjs", SNARKJS_CDN];
    let lastError: unknown;
    for (const specifier of candidates) {
      try {
        const mod = (await import(/* @vite-ignore */ /* webpackIgnore: true */ specifier)) as {
          default?: SnarkjsLike;
        } & SnarkjsLike;
        const resolved = (mod.groth16 ? mod : mod.default) as SnarkjsLike;
        if (typeof resolved?.groth16?.fullProve === "function") return resolved;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `Unable to load snarkjs prover: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  })();

  return snarkjsPromise;
}

/**
 * Map the structured circuit inputs onto the field-element signal names the
 * compiled circuit expects. Field elements are kept as decimal strings.
 */
function toWitnessInput(inputs: ZKWorkerRequest["inputs"]): Record<string, unknown> {
  return {
    meterId: inputs.meterId,
    consumption: inputs.consumption,
    salt: inputs.salt,
    merkleRoot: inputs.merkleRoot,
    encryptedCiphertext: inputs.encryptedCiphertext,
    timestamp: inputs.timestamp,
    blockHash: inputs.blockHash,
  };
}

worker.addEventListener("message", async (event: MessageEvent<ZKWorkerRequest>) => {
  const { id, type, inputs, wasmUrl, zkey } = event.data;
  if (type !== "prove") return;

  const post = (msg: ZKWorkerResponse, transfer?: Transferable[]) =>
    worker.postMessage(msg, transfer ?? []);

  try {
    post({ id, type: "progress", progress: 5 });
    const snarkjs = await loadSnarkjs();
    post({ id, type: "progress", progress: 20 });

    const zkeyData = new Uint8Array(zkey);

    // snarkjs streams witness generation then proving internally; we cannot get
    // fine-grained callbacks, so we bracket the call with coarse progress marks.
    post({ id, type: "progress", progress: 35 });
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      toWitnessInput(inputs),
      wasmUrl,
      { type: "mem", data: zkeyData }
    );
    post({ id, type: "progress", progress: 95 });

    post({ id, type: "result", proof, publicSignals });
  } catch (err) {
    post({
      id,
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});
