import { describe, it, expect, beforeAll } from 'vitest';
import { MerkleWasm } from '../utils/merkleWasm';
import fs from 'fs';
import path from 'path';

// Mock fetch for WASM loader in jsdom environment
global.fetch = async (url: RequestInfo | URL) => {
    if (url.toString().includes('merkle_wasm.wasm')) {
        const wasmPath = path.resolve(__dirname, '../../public/wasm/merkle_wasm.wasm');
        const buffer = fs.readFileSync(wasmPath);
        return {
            arrayBuffer: async () => buffer,
            ok: true
        } as Response;
    }
    throw new Error('Unexpected fetch in tests: ' + url);
};

// Mock instantiateStreaming since jsdom might not support it properly with our mocked fetch
const originalInstantiateStreaming = WebAssembly.instantiateStreaming;
global.WebAssembly.instantiateStreaming = async (response: Response | Promise<Response>, importObject?: WebAssembly.Imports) => {
    const res = await response;
    const buffer = await res.arrayBuffer();
    return WebAssembly.instantiate(buffer, importObject);
};

describe('MerkleWasm Benchmark', () => {
    let wasm: MerkleWasm;

    beforeAll(async () => {
        wasm = new MerkleWasm();
        await wasm.init();
    });

    it('should generate 1,000 leaves and measure hashes/sec > 15,000', () => {
        const numLeaves = 1000;
        const leaves = new Uint8Array(numLeaves * 64);
        for (let i = 0; i < leaves.length; i++) {
            leaves[i] = Math.floor(Math.random() * 256);
        }

        const iterations = 50;
        const hashesPerTree = numLeaves * 2 - 1;
        const totalHashes = hashesPerTree * iterations;

        const start = performance.now();
        
        let lastRoot: Uint8Array | null = null;
        let rootPtr = 0;
        for (let i = 0; i < iterations; i++) {
            const res = wasm.buildTree(leaves);
            lastRoot = res.root;
            rootPtr = res.rootPtr;
        }

        const end = performance.now();
        const durationSec = (end - start) / 1000;
        const hashesPerSec = totalHashes / durationSec;

        console.log(`Merkle Tree Construction: ${hashesPerSec.toFixed(2)} hashes/sec over ${iterations} iterations`);
        
        expect(hashesPerSec).toBeGreaterThanOrEqual(15000);

        const proofStart = performance.now();
        const proof = wasm.generateProof(rootPtr, 500);
        const proofEnd = performance.now();
        
        console.log(`Proof generation took ${(proofEnd - proofStart).toFixed(2)} ms`);
        expect(proofEnd - proofStart).toBeLessThan(70);

        const leafData = leaves.slice(500 * 64, 501 * 64);
        const isValid = wasm.verifyProof(lastRoot!, proof, leafData);
        expect(isValid).toBe(true);
    });
});
