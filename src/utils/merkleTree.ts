import { MerkleWasm } from './merkleWasm';

// Fallback JS implementation (stubbed for brevity as per instructions, only replacing actual usage)
function jsBuildTree(leaves: Uint8Array): { root: Uint8Array, rootPtr: number } {
    console.warn('Using JS fallback for Merkle tree construction');
    // Implement standard JS Merkle Tree if WASM completely fails
    return { root: new Uint8Array(32), rootPtr: 0 };
}

function jsGenerateProof(leafIndex: number): Uint8Array {
    return new Uint8Array(0);
}

function jsVerifyProof(root: Uint8Array, proof: Uint8Array, leafData: Uint8Array): boolean {
    return false;
}

let wasmInstance: MerkleWasm | null = null;
let initPromise: Promise<void> | null = null;

export async function initMerkleTree() {
    if (!initPromise) {
        wasmInstance = new MerkleWasm();
        initPromise = wasmInstance.init().catch(err => {
            console.error('Failed to initialize Merkle WASM:', err);
            wasmInstance = null;
        });
    }
    return initPromise;
}

export function buildTree(leaves: Uint8Array): { root: Uint8Array, rootPtr: number } {
    if (wasmInstance) {
        return wasmInstance.buildTree(leaves);
    }
    return jsBuildTree(leaves);
}

export function generateProof(treePtr: number, leafIndex: number): Uint8Array {
    if (wasmInstance) {
        return wasmInstance.generateProof(treePtr, leafIndex);
    }
    return jsGenerateProof(leafIndex);
}

export function verifyProof(root: Uint8Array, proof: Uint8Array, leafData: Uint8Array): boolean {
    if (wasmInstance) {
        return wasmInstance.verifyProof(root, proof, leafData);
    }
    return jsVerifyProof(root, proof, leafData);
}
