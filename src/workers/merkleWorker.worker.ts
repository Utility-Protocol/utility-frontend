import { initMerkleTree, buildTree, generateProof } from '../utils/merkleTree';

// Use the web worker interface
self.addEventListener('message', async (e: MessageEvent) => {
    const { type, leaves, treePtr, leafIndex, id } = e.data;

    try {
        await initMerkleTree();

        if (type === 'buildTree') {
            const { root, rootPtr } = buildTree(new Uint8Array(leaves));
            // Send ArrayBuffer back using transferable
            self.postMessage({ id, type: 'buildTreeResult', root: root.buffer, rootPtr }, [root.buffer]);
        } else if (type === 'generateProof') {
            const proof = generateProof(treePtr, leafIndex);
            self.postMessage({ id, type: 'generateProofResult', proof: proof.buffer }, [proof.buffer]);
        }
    } catch (err: any) {
        self.postMessage({ id, error: err.message });
    }
});
