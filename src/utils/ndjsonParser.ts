/**
 * Streaming NDJSON parser. Pipes a gzipped response body through the browser's
 * native `DecompressionStream` (falling back to the `pako` polyfill), splits the
 * decoded text on newlines, and yields parsed JSON objects as soon as each
 * complete line is available — without buffering the whole response.
 */

import type { ResourceRow } from "@/types/export";

export interface NdjsonParseOptions {
  /** Response body is gzip-compressed. @default true */
  gzip?: boolean;
  /** Invoked with the number of compressed bytes read, for progress. */
  onBytes?: (bytes: number) => void;
  signal?: AbortSignal;
}

type PakoModule = {
  inflate: (data: Uint8Array) => Uint8Array;
  ungzip?: (data: Uint8Array) => Uint8Array;
};

let pakoPromise: Promise<PakoModule> | null = null;

async function loadPako(): Promise<PakoModule> {
  if (pakoPromise) return pakoPromise;
  pakoPromise = (async () => {
    // `pako` is an optional polyfill loaded only on browsers without
    // DecompressionStream. The specifier is held in a variable so bundlers do
    // not attempt to resolve this optional dependency at build time.
    const specifier = "pako";
    const mod = (await import(/* @vite-ignore */ /* webpackIgnore: true */ specifier)) as {
      default?: PakoModule;
    } & PakoModule;
    return (mod.ungzip ? mod : mod.default) as PakoModule;
  })();
  return pakoPromise;
}

function hasDecompressionStream(): boolean {
  return typeof globalThis.DecompressionStream === "function";
}

/** Count raw bytes flowing through the stream (before decompression). */
function byteCountingStream(
  onBytes?: (bytes: number) => void
): TransformStream<Uint8Array, Uint8Array> {
  return new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      onBytes?.(chunk.byteLength);
      controller.enqueue(chunk);
    },
  });
}

/**
 * Yield parsed rows from a (gzipped) NDJSON response body. Blank lines are
 * skipped; a malformed final line without a trailing newline is still parsed.
 */
export async function* parseNdjsonStream(
  body: ReadableStream<Uint8Array>,
  options: NdjsonParseOptions = {}
): AsyncGenerator<ResourceRow> {
  const { gzip = true, onBytes, signal } = options;

  // Native decompression keeps everything as a stream. The pako fallback must
  // buffer the (gzipped) body first, then inflate — used only on old browsers.
  if (gzip && !hasDecompressionStream()) {
    yield* parseWithPako(body, onBytes, signal);
    return;
  }

  let stream: ReadableStream<Uint8Array> = body.pipeThrough(
    byteCountingStream(onBytes)
  );
  if (gzip) {
    // Cast: the DOM lib types DecompressionStream's writable side as
    // BufferSource, which TS will not unify with ReadableStream<Uint8Array>.
    stream = stream.pipeThrough(
      new DecompressionStream("gzip") as unknown as ReadableWritablePair<
        Uint8Array,
        Uint8Array
      >
    );
  }

  const reader = stream
    .pipeThrough(
      new TextDecoderStream() as unknown as ReadableWritablePair<
        string,
        Uint8Array
      >
    )
    .getReader();
  let buffer = "";

  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) yield JSON.parse(line) as ResourceRow;
      }
    }
    const last = buffer.trim();
    if (last) yield JSON.parse(last) as ResourceRow;
  } finally {
    reader.releaseLock();
  }
}

async function* parseWithPako(
  body: ReadableStream<Uint8Array>,
  onBytes?: (bytes: number) => void,
  signal?: AbortSignal
): AsyncGenerator<ResourceRow> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
      onBytes?.(value.byteLength);
    }
  } finally {
    reader.releaseLock();
  }

  const compressed = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    compressed.set(c, offset);
    offset += c.byteLength;
  }

  const pako = await loadPako();
  const inflated = (pako.ungzip ?? pako.inflate)(compressed);
  const text = new TextDecoder().decode(inflated);
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (line) yield JSON.parse(line) as ResourceRow;
  }
}
