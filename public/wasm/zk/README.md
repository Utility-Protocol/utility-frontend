# ZK circuit artifacts

This directory hosts the Groth16 (BLS12-381) circuit artifacts used by the
anonymous meter-reading proof module.

| File                 | Purpose                                  | Size    |
| -------------------- | ---------------------------------------- | ------- |
| `circuit.wasm`       | Compiled witness generator (circom)      | ~5 MB   |
| `circuit_final.zkey` | Groth16 proving key                      | ~150 MB |

## Why these are not committed

`circuit_final.zkey` is ~150 MB and **must not** be committed or re-downloaded
per proof. In production it is hosted on a CDN (e.g. S3 + CloudFront) and pulled
on demand into IndexedDB by [`src/services/keyCache.ts`](../../../src/services/keyCache.ts),
which:

- resumes interrupted transfers with HTTP `Range` requests,
- verifies a SHA-256 integrity hash before use, and
- evicts least-recently-used keys to stay within a storage budget.

## Configuration

Point the prover at the hosted key via environment variables (see
[`src/services/zkProver.ts`](../../../src/services/zkProver.ts)):

```
NEXT_PUBLIC_ZK_ZKEY_URL=https://cdn.example.com/zk/circuit_final.zkey
NEXT_PUBLIC_ZK_ZKEY_SHA256=<lowercase hex sha-256 of the zkey>
```

The `.placeholder` files in this directory exist only so the path resolves in
local development; replace them (or override the URL) with the real artifacts.
