let cachedInstance: WebAssembly.Instance | null = null;
let cachedMemory: WebAssembly.Memory | null = null;

export async function loadMerkleWasm(): Promise<{ instance: WebAssembly.Instance; memory: WebAssembly.Memory }> {
    if (cachedInstance && cachedMemory) {
        return { instance: cachedInstance, memory: cachedMemory };
    }

    const response = await fetch('/wasm/merkle_wasm.wasm');
    const wasmModule = await WebAssembly.instantiateStreaming(response, {});

    cachedInstance = wasmModule.instance;
    cachedMemory = wasmModule.instance.exports.memory as WebAssembly.Memory;

    return { instance: cachedInstance, memory: cachedMemory };
}
