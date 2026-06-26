"use client";

import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import type { Groth16Proof, Groth16VerificationKey } from "@/types/zk";
import { getRpcUrl } from "@/services/soroban";
import { buildCacheKey, cacheGet, cacheSet } from "@/services/cache";

/**
 * Client-side Groth16 verifier. The verification key lives on-chain in the
 * Soroban contract under the `zk_verification_key` data entry. It is fetched
 * once, cached locally for 24 hours, and used to verify proofs during audit
 * with snarkjs — no proving key or private signals are involved.
 */

/** On-chain data-entry key holding the serialized verification key. */
const VK_DATA_ENTRY = "zk_verification_key";

/** Verification keys are cached for 24h, matching the freshness requirement. */
const VK_TTL_MS = 24 * 60 * 60 * 1000;

const SNARKJS_CDN = "https://cdn.jsdelivr.net/npm/snarkjs@0.7.5/+esm";

interface SnarkjsVerifier {
  groth16: {
    verify: (
      vk: Groth16VerificationKey,
      publicSignals: string[],
      proof: Groth16Proof
    ) => Promise<boolean>;
  };
}

let snarkjsPromise: Promise<SnarkjsVerifier> | null = null;

async function loadSnarkjs(): Promise<SnarkjsVerifier> {
  if (snarkjsPromise) return snarkjsPromise;
  snarkjsPromise = (async () => {
    let lastError: unknown;
    for (const specifier of ["snarkjs", SNARKJS_CDN]) {
      try {
        const mod = (await import(/* webpackIgnore: true */ specifier)) as {
          default?: SnarkjsVerifier;
        } & SnarkjsVerifier;
        const resolved = (mod.groth16 ? mod : mod.default) as SnarkjsVerifier;
        if (typeof resolved?.groth16?.verify === "function") return resolved;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(
      `Unable to load snarkjs verifier: ${
        lastError instanceof Error ? lastError.message : String(lastError)
      }`
    );
  })();
  return snarkjsPromise;
}

/**
 * Read the verification key from the Soroban contract's persistent storage.
 * The contract stores it as a Bytes/string scval containing JSON.
 */
async function fetchVerificationKeyFromChain(
  contractId: string,
  network: string
): Promise<Groth16VerificationKey> {
  const server = new rpc.Server(getRpcUrl(network));
  const key = xdr.ScVal.scvSymbol(VK_DATA_ENTRY);

  const entry = await server.getContractData(
    contractId,
    key,
    rpc.Durability.Persistent
  );

  const native = scValToNative(entry.val.contractData().val());
  const json =
    typeof native === "string"
      ? native
      : new TextDecoder().decode(native as Uint8Array);
  const vk = JSON.parse(json) as Groth16VerificationKey;

  if (vk.protocol !== "groth16") {
    throw new Error(`Unexpected proof system in verification key: ${vk.protocol}`);
  }
  return vk;
}

/**
 * Return the contract's Groth16 verification key, served from the 24h local
 * cache when fresh and otherwise fetched from chain and re-cached.
 */
export async function getVerificationKey(
  contractId: string,
  network: string = "testnet",
  options: { forceRefresh?: boolean } = {}
): Promise<Groth16VerificationKey> {
  const cacheKey = buildCacheKey(["zk-vk", network, contractId]);

  if (!options.forceRefresh) {
    const cached = await cacheGet<Groth16VerificationKey>(cacheKey);
    if (cached) return cached;
  }

  const vk = await fetchVerificationKeyFromChain(contractId, network);
  await cacheSet(cacheKey, vk, VK_TTL_MS);
  return vk;
}

export interface VerifyOptions {
  contractId: string;
  network?: string;
  /** Skip the cache and re-fetch the verification key from chain. */
  forceRefresh?: boolean;
}

/**
 * Verify a Groth16 proof against the contract's verification key. Resolves to
 * `true`/`false`; a thrown error means verification could not be performed
 * (e.g. the key could not be fetched), which callers should treat as a reject.
 */
export async function verifyProof(
  proof: Groth16Proof,
  publicSignals: string[],
  options: VerifyOptions
): Promise<boolean> {
  const vk = await getVerificationKey(
    options.contractId,
    options.network ?? "testnet",
    { forceRefresh: options.forceRefresh }
  );

  if (publicSignals.length !== vk.nPublic) {
    // A signal-count mismatch can never verify; fail fast and clearly.
    return false;
  }

  const snarkjs = await loadSnarkjs();
  return snarkjs.groth16.verify(vk, publicSignals, proof);
}
