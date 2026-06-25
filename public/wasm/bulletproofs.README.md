# Bulletproofs range-proof WASM

The Proof-of-Reserve worker (`src/workers/proofWorker.worker.ts`) loads a
Bulletproofs range prover from `bulletproofs.wasm` in this directory.

## Building

Compile the dalek `bulletproofs` crate with `wasm-pack`:

```
wasm-pack build --target bundler --release
```

Constraints (see `src/types/reserve.ts`):

- Range proof over `[0, 2^64)` with a 64-bit commitment.
- Gzipped binary **must not exceed 2 MB**.
- Proof generation must complete within ~5 s on a Snapdragon 7c tablet.

## Integrity

Host the binary and pin its SHA-256 so the loader rejects tampering:

```
NEXT_PUBLIC_BULLETPROOFS_WASM_URL=https://cdn.example.com/wasm/bulletproofs.wasm
NEXT_PUBLIC_BULLETPROOFS_WASM_SHA256=<lowercase hex sha-256>
```

`src/utils/wasmLoader.ts` (`loadWasmModule`) fetches, verifies, instantiates and
caches it.

## Development fallback

Until the binary is present the worker emits a **clearly-marked deterministic
placeholder** proof so the end-to-end flow works in development. The placeholder
is **not** zero-knowledge and must never be used for real attestation — drop the
real `bulletproofs.wasm` here (or set the env URL) before production use.
