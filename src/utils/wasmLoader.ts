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

// ---------------------------------------------------------------------------
// Generic WASM loader (used by the Proof-of-Reserve prover worker).
// ---------------------------------------------------------------------------

const moduleCache = new Map<string, Promise<WebAssembly.Instance>>();

export interface LoadWasmOptions {
    /** Import object passed to instantiation. */
    imports?: WebAssembly.Imports;
    /** Expected lowercase-hex SHA-256 of the binary; verified before use. */
    integrity?: string;
    /** Bypass the in-memory cache. */
    noCache?: boolean;
}

export class WasmIntegrityError extends Error {
    constructor(readonly url: string, readonly expected: string, readonly actual: string) {
        super(`WASM integrity check failed for ${url}: expected ${expected}, got ${actual}`);
        this.name = 'WasmIntegrityError';
    }
}

async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
}

/**
 * Fetch, optionally verify (SHA-256), instantiate and cache a WASM module by
 * URL. When `integrity` is provided the module is rejected on mismatch. Uses
 * buffer instantiation (not streaming) so the bytes can be hashed first.
 */
export async function loadWasmModule(
    url: string,
    options: LoadWasmOptions = {},
): Promise<WebAssembly.Instance> {
    if (!options.noCache) {
        const cached = moduleCache.get(url);
        if (cached) return cached;
    }

    const promise = (async () => {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch WASM ${url}: HTTP ${response.status}`);
        }
        const bytes = await response.arrayBuffer();

        if (options.integrity) {
            const actual = await sha256Hex(bytes);
            if (actual !== options.integrity.toLowerCase()) {
                throw new WasmIntegrityError(url, options.integrity.toLowerCase(), actual);
            }
        }

        const { instance } = await WebAssembly.instantiate(bytes, options.imports ?? {});
        return instance;
    })();

    if (!options.noCache) {
        // Drop the cache entry if loading fails so a retry can succeed.
        moduleCache.set(
            url,
            promise.catch((err) => {
                moduleCache.delete(url);
                throw err;
            }),
        );
    }
    return promise;
}

/** Clear the generic WASM module cache. */
export function clearWasmCache(): void {
    moduleCache.clear();
}
