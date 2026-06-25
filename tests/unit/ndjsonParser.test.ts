import { describe, it, expect } from "vitest";
import { parseNdjsonStream } from "@/utils/ndjsonParser";

/** Build a ReadableStream that emits the given string pieces as UTF-8 bytes. */
function streamFrom(pieces: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < pieces.length) {
        controller.enqueue(encoder.encode(pieces[i++]));
      } else {
        controller.close();
      }
    },
  });
}

async function collect(
  body: ReadableStream<Uint8Array>,
  opts?: Parameters<typeof parseNdjsonStream>[1]
): Promise<unknown[]> {
  const rows: unknown[] = [];
  for await (const row of parseNdjsonStream(body, { gzip: false, ...opts })) {
    rows.push(row);
  }
  return rows;
}

describe("parseNdjsonStream (uncompressed)", () => {
  it("yields one parsed object per line", async () => {
    const rows = await collect(
      streamFrom(['{"a":1}\n', '{"a":2}\n', '{"a":3}\n'])
    );
    expect(rows).toEqual([{ a: 1 }, { a: 2 }, { a: 3 }]);
  });

  it("handles lines split across stream chunks", async () => {
    const rows = await collect(streamFrom(['{"id":', '10}\n{"id":', "20}\n"]));
    expect(rows).toEqual([{ id: 10 }, { id: 20 }]);
  });

  it("parses a trailing line without a final newline", async () => {
    const rows = await collect(streamFrom(['{"x":1}\n{"x":2}']));
    expect(rows).toEqual([{ x: 1 }, { x: 2 }]);
  });

  it("skips blank lines", async () => {
    const rows = await collect(streamFrom(['{"a":1}\n', "\n", '{"a":2}\n']));
    expect(rows).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("reports bytes read via onBytes", async () => {
    let bytes = 0;
    await collect(streamFrom(['{"a":1}\n']), { onBytes: (n) => (bytes += n) });
    expect(bytes).toBe(8); // '{"a":1}\n' is 8 bytes
  });
});
