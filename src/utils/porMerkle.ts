/**
 * SHA-256 Merkle tree for Proof-of-Reserve commitments.
 *
 * Each leaf is `SHA-256( meterId || consumption(8-byte LE) || salt )`. The tree
 * pads odd layers by duplicating the last node and supports up to 2^20 leaves.
 * Hashing uses SubtleCrypto so large trees do not block the main thread.
 *
 * This is a dedicated module (the existing `merkleTree.ts` is a WASM-pointer
 * wrapper used by `merkleWorker.worker.ts`); the two are intentionally separate.
 */

const encoder = new TextEncoder();

/** SHA-256 of the given bytes. */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", data as unknown as BufferSource);
  return new Uint8Array(digest);
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) throw new Error(`Odd-length hex: ${hex}`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

/** Encode a non-negative integer as 8 little-endian bytes. */
export function u64le(value: bigint | number): Uint8Array {
  let v = BigInt(value);
  if (v < BigInt(0)) throw new Error("consumption must be non-negative");
  const out = new Uint8Array(8);
  const mask = BigInt(0xff);
  const shift = BigInt(8);
  for (let i = 0; i < 8; i++) {
    out[i] = Number(v & mask);
    v >>= shift;
  }
  return out;
}

export interface MeterLeaf {
  meterId: string;
  consumption: bigint | number;
  /** Salt as hex (0x-optional). */
  salt: string;
}

/** Hash a single meter leaf: SHA-256(meterId || consumption || salt). */
export function leafHash(leaf: MeterLeaf): Promise<Uint8Array> {
  return sha256(
    concat([
      encoder.encode(leaf.meterId),
      u64le(leaf.consumption),
      hexToBytes(leaf.salt),
    ])
  );
}

/** One step of a Merkle inclusion path. */
export interface MerkleProofStep {
  sibling: Uint8Array;
  /** True when the sibling sits to the left of the running hash. */
  siblingIsLeft: boolean;
}

export interface MerkleTree {
  root: Uint8Array;
  /** layers[0] = leaves, last layer = [root]. */
  layers: Uint8Array[][];
}

/** Hash a parent from its two children. */
async function hashPair(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(concat([left, right]));
}

/**
 * Build the full tree from leaf hashes. An empty input yields a zero root.
 * Odd layers duplicate their final node so every parent has two children.
 */
export async function buildTree(leaves: Uint8Array[]): Promise<MerkleTree> {
  if (leaves.length === 0) {
    return { root: new Uint8Array(32), layers: [[]] };
  }

  const layers: Uint8Array[][] = [leaves.slice()];
  let current = leaves;
  while (current.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < current.length; i += 2) {
      const left = current[i];
      const right = i + 1 < current.length ? current[i + 1] : current[i];
      next.push(await hashPair(left, right));
    }
    layers.push(next);
    current = next;
  }
  return { root: current[0], layers };
}

/** Convenience: just the root hex of a set of leaves. */
export async function computeRoot(leaves: Uint8Array[]): Promise<string> {
  const { root } = await buildTree(leaves);
  return bytesToHex(root);
}

/** Generate the inclusion path for the leaf at `index`. */
export function generateProof(tree: MerkleTree, index: number): MerkleProofStep[] {
  const leafCount = tree.layers[0].length;
  if (index < 0 || index >= leafCount) {
    throw new Error(`Leaf index ${index} out of range (0..${leafCount - 1})`);
  }
  const proof: MerkleProofStep[] = [];
  let idx = index;
  for (let level = 0; level < tree.layers.length - 1; level++) {
    const layer = tree.layers[level];
    const isRightNode = idx % 2 === 1;
    const siblingIndex = isRightNode ? idx - 1 : idx + 1;
    // Odd layer: the lone last node is paired with itself.
    const sibling = layer[siblingIndex] ?? layer[idx];
    proof.push({ sibling, siblingIsLeft: isRightNode });
    idx = Math.floor(idx / 2);
  }
  return proof;
}

/** Verify an inclusion path folds up to `root`. */
export async function verifyProof(
  root: Uint8Array,
  leaf: Uint8Array,
  proof: MerkleProofStep[]
): Promise<boolean> {
  let hash = leaf;
  for (const step of proof) {
    hash = step.siblingIsLeft
      ? await hashPair(step.sibling, hash)
      : await hashPair(hash, step.sibling);
  }
  return bytesToHex(hash) === bytesToHex(root);
}
