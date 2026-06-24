import { loadMerkleWasm } from './wasmLoader';

export class MerkleWasm {
    private instance: WebAssembly.Instance | null = null;
    private memory: WebAssembly.Memory | null = null;

    async init() {
        const result = await loadMerkleWasm();
        this.instance = result.instance;
        this.memory = result.memory;
    }

    private get exports() {
        if (!this.instance) throw new Error('WASM not initialized');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return this.instance.exports as any;
    }

    allocUint8Array(data: Uint8Array): number {
        const ptr = this.exports.alloc(data.length);
        const memArray = new Uint8Array(this.memory!.buffer, ptr, data.length);
        memArray.set(data);
        return ptr;
    }

    dealloc(ptr: number, size: number) {
        this.exports.dealloc(ptr, size);
    }

    buildTree(leaves: Uint8Array): { root: Uint8Array, rootPtr: number } {
        if (leaves.length % 64 !== 0) {
            throw new Error('Leaves buffer must be a multiple of 64 bytes');
        }
        const numLeaves = leaves.length / 64;
        const leavesPtr = this.allocUint8Array(leaves);
        
        const rootPtr = this.exports.merkle_build_tree(leavesPtr, numLeaves);
        
        let root = new Uint8Array(0);
        if (rootPtr !== 0) {
            root = new Uint8Array(this.memory!.buffer, rootPtr, 32).slice();
        }
        
        this.dealloc(leavesPtr, leaves.length);
        return { root, rootPtr };
    }

    generateProof(treePtr: number, leafIndex: number): Uint8Array {
        // treePtr is ignored because WASM keeps tree globally to avoid passing pointers back and forth
        const proofPtr = this.exports.merkle_generate_proof(leafIndex);
        
        const memArray = new Uint8Array(this.memory!.buffer, proofPtr, 4);
        const dataView = new DataView(memArray.buffer, memArray.byteOffset, memArray.byteLength);
        const proofLen = dataView.getUint32(0, true);
        
        const hashesArray = new Uint8Array(this.memory!.buffer, proofPtr + 4, proofLen * 32);
        return hashesArray.slice();
    }

    verifyProof(root: Uint8Array, proof: Uint8Array, leafData: Uint8Array): boolean {
        const proofLen = proof.length / 32;
        const proofBuffer = new Uint8Array(4 + proof.length);
        const dv = new DataView(proofBuffer.buffer, proofBuffer.byteOffset, proofBuffer.byteLength);
        dv.setUint32(0, proofLen, true);
        proofBuffer.set(proof, 4);

        const rootPtr = this.allocUint8Array(root);
        const proofPtr = this.allocUint8Array(proofBuffer);
        const leafPtr = this.allocUint8Array(leafData);

        const result = this.exports.merkle_verify_proof(rootPtr, proofPtr, leafPtr) === 1;

        this.dealloc(rootPtr, root.length);
        this.dealloc(proofPtr, proofBuffer.length);
        this.dealloc(leafPtr, leafData.length);

        return result;
    }
}
