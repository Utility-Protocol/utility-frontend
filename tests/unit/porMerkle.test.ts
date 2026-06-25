import { describe, it, expect } from "vitest";
import {
  buildTree,
  computeRoot,
  generateProof,
  verifyProof,
  leafHash,
  sha256,
  u64le,
  bytesToHex,
  hexToBytes,
} from "@/utils/porMerkle";

async function leaves(n: number) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(
      await leafHash({ meterId: `meter-${i}`, consumption: i * 100, salt: "0xdead" })
    );
  }
  return out;
}

describe("hex / u64le helpers", () => {
  it("round-trips hex", () => {
    const bytes = new Uint8Array([0, 255, 16, 1]);
    expect(hexToBytes(bytesToHex(bytes))).toEqual(bytes);
    expect(hexToBytes("0xff00")).toEqual(new Uint8Array([255, 0]));
  });

  it("encodes u64 little-endian", () => {
    expect(Array.from(u64le(1))).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(Array.from(u64le(256))).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);
  });

  it("rejects negative consumption", () => {
    expect(() => u64le(-1)).toThrow();
  });
});

describe("leafHash", () => {
  it("is deterministic and 32 bytes", async () => {
    const a = await leafHash({ meterId: "m1", consumption: 10, salt: "0x01" });
    const b = await leafHash({ meterId: "m1", consumption: 10, salt: "0x01" });
    expect(a).toEqual(b);
    expect(a.length).toBe(32);
  });

  it("changes when any field changes", async () => {
    const base = await leafHash({ meterId: "m1", consumption: 10, salt: "0x01" });
    const diff = await leafHash({ meterId: "m1", consumption: 11, salt: "0x01" });
    expect(bytesToHex(base)).not.toBe(bytesToHex(diff));
  });
});

describe("buildTree / computeRoot", () => {
  it("a single leaf is its own root", async () => {
    const [leaf] = await leaves(1);
    const { root } = await buildTree([leaf]);
    expect(bytesToHex(root)).toBe(bytesToHex(leaf));
  });

  it("is deterministic across builds", async () => {
    const l = await leaves(5);
    expect(await computeRoot(l)).toBe(await computeRoot(l.slice()));
  });

  it("a two-leaf root equals SHA-256(left||right)", async () => {
    const l = await leaves(2);
    const expected = await sha256(
      new Uint8Array([...l[0], ...l[1]])
    );
    const { root } = await buildTree(l);
    expect(bytesToHex(root)).toBe(bytesToHex(expected));
  });

  it("empty input yields a zero root", async () => {
    const { root } = await buildTree([]);
    expect(bytesToHex(root)).toBe("00".repeat(32));
  });
});

describe("generateProof / verifyProof", () => {
  it("verifies an inclusion path for every leaf (balanced tree)", async () => {
    const l = await leaves(8);
    const tree = await buildTree(l);
    for (let i = 0; i < l.length; i++) {
      const proof = generateProof(tree, i);
      expect(await verifyProof(tree.root, l[i], proof)).toBe(true);
    }
  });

  it("verifies with an odd number of leaves (padded layer)", async () => {
    const l = await leaves(5);
    const tree = await buildTree(l);
    for (let i = 0; i < l.length; i++) {
      const proof = generateProof(tree, i);
      expect(await verifyProof(tree.root, l[i], proof)).toBe(true);
    }
  });

  it("rejects a tampered leaf", async () => {
    const l = await leaves(8);
    const tree = await buildTree(l);
    const proof = generateProof(tree, 3);
    const forged = await leafHash({ meterId: "evil", consumption: 0, salt: "0x00" });
    expect(await verifyProof(tree.root, forged, proof)).toBe(false);
  });

  it("rejects an out-of-range index", async () => {
    const tree = await buildTree(await leaves(4));
    expect(() => generateProof(tree, 4)).toThrow(/out of range/);
  });
});
