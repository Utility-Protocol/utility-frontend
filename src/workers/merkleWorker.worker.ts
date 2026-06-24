import { initMerkleTree, buildTree, generateProof } from '../utils/merkleTree';

// Use the web worker interface
const worker = self as unknown as Worker;

worker.addEventListener('message', async (e: MessageEvent) => {
    const { type, leaves, treePtr, leafIndex, id } = e.data;

    try {
        await initMerkleTree();

        if (type === 'buildTree') {
            const { root, rootPtr } = buildTree(new Uint8Array(leaves));
            // Send ArrayBuffer back using transferable
            worker.postMessage({ id, type: 'buildTreeResult', root: root.buffer, rootPtr }, [root.buffer as ArrayBuffer]);
        } else if (type === 'generateProof') {
            const proof = generateProof(treePtr, leafIndex);
            worker.postMessage({ id, type: 'generateProofResult', proof: proof.buffer }, [proof.buffer as ArrayBuffer]);
        }
    } catch (err: unknown) {
        worker.postMessage({ id, error: (err as Error).message });
    }
});
