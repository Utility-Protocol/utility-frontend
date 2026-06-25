import { describe, it, expect } from "vitest";
import { ExportPipeline } from "@/services/exportPipeline";
import type { FileWriter } from "@/utils/fileWriter";
import type { ExportConfig, ExportEvent, ResourceRow } from "@/types/export";

/** In-memory FileWriter that records everything written. */
function memoryWriter(): FileWriter & { bytes(): Uint8Array; text(): string } {
  const chunks: Uint8Array[] = [];
  let total = 0;
  return {
    usedFallback: true,
    get bytesWritten() {
      return total;
    },
    async write(chunk) {
      chunks.push(chunk);
      total += chunk.byteLength;
    },
    async close() {},
    async abort() {},
    bytes() {
      const out = new Uint8Array(total);
      let o = 0;
      for (const c of chunks) {
        out.set(c, o);
        o += c.byteLength;
      }
      return out;
    },
    text() {
      return new TextDecoder().decode(this.bytes());
    },
  };
}

/** Build a fetch stub that serves NDJSON pages keyed by the `offset` param. */
function ndjsonFetch(pages: ResourceRow[][]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    const offset = Number(url.searchParams.get("offset") ?? "0");
    const limit = Number(url.searchParams.get("limit") ?? "10000");
    const pageIndex = Math.floor(offset / 10000);
    const rows = pages[pageIndex] ?? [];
    const body = rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
    void limit;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/x-ndjson" },
    });
  }) as typeof fetch;
}

async function runPipeline(
  config: ExportConfig,
  pages: ResourceRow[][]
): Promise<{ writer: ReturnType<typeof memoryWriter>; events: ExportEvent[] }> {
  const writer = memoryWriter();
  const events: ExportEvent[] = [];
  const pipeline = new ExportPipeline(config, {
    fetchFn: ndjsonFetch(pages),
    createWriter: async () => writer,
    baseUrl: "http://test.local",
  });
  pipeline.on((e) => events.push(e));
  await pipeline.run();
  return { writer, events };
}

describe("ExportPipeline — CSV", () => {
  it("writes a header and one line per row, stopping on a short chunk", async () => {
    const { writer, events } = await runPipeline(
      { format: "csv", columns: ["id", "kwh"], maxRows: 100 },
      [[{ id: 1, kwh: 10 }, { id: 2, kwh: 20 }, { id: 3, kwh: 30 }]]
    );

    expect(writer.text()).toBe("id,kwh\r\n1,10\r\n2,20\r\n3,30\r\n");
    const complete = events.find((e) => e.type === "complete");
    expect(complete).toMatchObject({ type: "complete", rowsWritten: 3 });
  });

  it("applies client-side filters", async () => {
    const { writer } = await runPipeline(
      {
        format: "csv",
        columns: ["id", "kwh"],
        maxRows: 100,
        filters: [{ field: "kwh", operator: "gte", value: 20 }],
      },
      [[{ id: 1, kwh: 10 }, { id: 2, kwh: 20 }, { id: 3, kwh: 30 }]]
    );
    expect(writer.text()).toBe("id,kwh\r\n2,20\r\n3,30\r\n");
  });

  it("spans multiple chunks via the sliding prefetch window", async () => {
    const fullPage = Array.from({ length: 10000 }, (_, i) => ({ id: i }));
    const lastPage = [{ id: 10000 }, { id: 10001 }];
    const { writer, events } = await runPipeline(
      { format: "csv", columns: ["id"], maxRows: 1_000_000 },
      [fullPage, lastPage]
    );
    const lines = writer.text().trimEnd().split("\r\n");
    // header + 10002 rows
    expect(lines.length).toBe(1 + 10002);
    const chunkCompletes = events.filter((e) => e.type === "chunkComplete");
    expect(chunkCompletes.length).toBe(2);
  });
});

describe("ExportPipeline — GeoJSON", () => {
  it("wraps features in a FeatureCollection with truncated coordinates", async () => {
    const { writer } = await runPipeline(
      {
        format: "geojson",
        columns: ["id"],
        maxRows: 100,
        lonField: "lon",
        latField: "lat",
      },
      [[{ id: "a", lon: 1.23456789, lat: 2.3456789 }]]
    );
    const parsed = JSON.parse(writer.text());
    expect(parsed.type).toBe("FeatureCollection");
    expect(parsed.features).toHaveLength(1);
    expect(parsed.features[0].geometry.coordinates).toEqual([1.234567, 2.345678]);
    expect(parsed.features[0].properties).toEqual({ id: "a" });
  });

  it("emits a valid empty FeatureCollection when there are no rows", async () => {
    const { writer } = await runPipeline(
      { format: "geojson", columns: ["id"], maxRows: 100 },
      [[]]
    );
    expect(JSON.parse(writer.text())).toEqual({
      type: "FeatureCollection",
      features: [],
    });
  });
});

describe("ExportPipeline — shapefile", () => {
  it("produces a zip archive containing the four shapefile components", async () => {
    const { writer } = await runPipeline(
      {
        format: "shapefile",
        columns: ["meter"],
        maxRows: 100,
        lonField: "lon",
        latField: "lat",
      },
      [[{ meter: "A", lon: 1, lat: 2 }, { meter: "B", lon: 3, lat: 4 }]]
    );
    const bytes = writer.bytes();
    const view = new DataView(bytes.buffer);
    // ZIP local file header signature.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // Four entries in the central directory (EOCD is the last 22 bytes).
    expect(view.getUint16(bytes.length - 22 + 10, true)).toBe(4);
  });
});

describe("ExportPipeline — cancellation", () => {
  it("emits a cancelled event and stops when cancel() is called", async () => {
    const writer = memoryWriter();
    const events: ExportEvent[] = [];
    const pipeline = new ExportPipeline(
      { format: "csv", columns: ["id"], maxRows: 1_000_000 },
      {
        fetchFn: ndjsonFetch([
          Array.from({ length: 10000 }, (_, i) => ({ id: i })),
        ]),
        createWriter: async () => writer,
        baseUrl: "http://test.local",
      }
    );
    pipeline.on((e) => {
      events.push(e);
      if (e.type === "chunkStart") pipeline.cancel();
    });
    await pipeline.run();
    expect(events.some((e) => e.type === "cancelled")).toBe(true);
    expect(events.some((e) => e.type === "complete")).toBe(false);
  });
});
