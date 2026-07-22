"use client";

import {
  CHUNK_SIZE,
  MAX_CHUNKS,
  MAX_ROWS,
  MEMORY_FLUSH_THRESHOLD,
  PREFETCH_WINDOW,
  type ExportConfig,
  type ExportEvent,
  type ExportEventListener,
  type ExportFilter,
  type ResourceRow,
} from "@/types/export";
import { parseNdjsonStream } from "@/utils/ndjsonParser";
import {
  csvHeader,
  csvTransformer,
  geoJsonTransformerString,
  shapefileTransformer,
  type GeometryFieldConfig,
} from "@/utils/formatTransformers";
import {
  ShapefilePointWriter,
  buildShapefileZipEntries,
  type ShapefileField,
} from "@/utils/shapefileWriter";
import { createStoredZip } from "@/utils/zip";
import {
  createFileWriter,
  type CreateFileWriterOptions,
  type FileWriter,
} from "@/utils/fileWriter";
import { getTracer } from "@/utils/telemetry/tracing";

/** Injectable dependencies, primarily for testing. */
export interface ExportPipelineDeps {
  fetchFn?: typeof fetch;
  createWriter?: (options: CreateFileWriterOptions) => Promise<FileWriter>;
  baseUrl?: string;
  /** Column → shapefile DBF type map (defaults all columns to "C"). */
  shapefileFieldTypes?: Record<string, ShapefileField["type"]>;
}

const FORMAT_META: Record<
  ExportConfig["format"],
  { mimeType: string; extension: string; description: string }
> = {
  csv: { mimeType: "text/csv", extension: ".csv", description: "CSV file" },
  geojson: {
    mimeType: "application/geo+json",
    extension: ".geojson",
    description: "GeoJSON file",
  },
  shapefile: {
    mimeType: "application/zip",
    extension: ".zip",
    description: "Zipped shapefile",
  },
};

function compareFilter(rowValue: unknown, filter: ExportFilter): boolean {
  const { operator, value } = filter;
  if (operator === "contains") {
    return String(rowValue ?? "")
      .toLowerCase()
      .includes(String(value).toLowerCase());
  }
  // Numeric comparison when both sides are numbers, else lexical.
  const a = rowValue as number | string;
  const b = value as number | string;
  switch (operator) {
    case "eq":
      return a === b || String(a) === String(b);
    case "neq":
      return !(a === b || String(a) === String(b));
    case "gt":
      return a > b;
    case "gte":
      return a >= b;
    case "lt":
      return a < b;
    case "lte":
      return a <= b;
    default:
      return true;
  }
}

function matchesFilters(row: ResourceRow, filters: ExportFilter[]): boolean {
  for (const filter of filters) {
    if (!compareFilter(row[filter.field], filter)) return false;
  }
  return true;
}

/**
 * Streaming bulk-export orchestrator. Fetches chunked, gzipped NDJSON from the
 * REST API with a sliding prefetch window, transforms rows into the target
 * format, and writes the result through a {@link FileWriter} while keeping
 * in-memory buffering under {@link MEMORY_FLUSH_THRESHOLD}.
 */
export class ExportPipeline {
  private readonly listeners = new Set<ExportEventListener>();
  private readonly controller = new AbortController();
  private readonly fetchFn: typeof fetch;
  private readonly createWriter: (
    options: CreateFileWriterOptions
  ) => Promise<FileWriter>;
  private readonly baseUrl: string;
  private readonly geometry: GeometryFieldConfig;
  private readonly maxRows: number;

  private writer: FileWriter | null = null;
  private buffer: Uint8Array[] = [];
  private bufferBytes = 0;
  private bytesDownloaded = 0;
  private bytesWritten = 0;
  private rowsWritten = 0;
  private cancelled = false;

  // Format-specific output state.
  private csvHeaderWritten = false;
  private geoJsonStarted = false;
  private shapefileWriter: ShapefilePointWriter | null = null;

  constructor(
    private readonly config: ExportConfig,
    private readonly deps: ExportPipelineDeps = {}
  ) {
    this.fetchFn = deps.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.createWriter = deps.createWriter ?? createFileWriter;
    this.baseUrl =
      deps.baseUrl ??
      process.env.NEXT_PUBLIC_API_URL ??
      "http://localhost:4000";
    this.geometry = {
      lonField: config.lonField ?? "longitude",
      latField: config.latField ?? "latitude",
    };
    this.maxRows = Math.min(config.maxRows ?? MAX_ROWS, MAX_ROWS);
  }

  on(listener: ExportEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(event: ExportEvent): void {
    for (const listener of this.listeners) listener(event);
  }

  cancel(): void {
    this.cancelled = true;
    this.controller.abort();
  }

  get totalChunks(): number {
    return Math.min(MAX_CHUNKS, Math.ceil(this.maxRows / CHUNK_SIZE));
  }

  /** Whether the Blob download fallback is in use (no FS Access API). */
  get usedFallback(): boolean {
    return this.writer?.usedFallback ?? false;
  }

  private buildUrl(offset: number, limit: number): string {
    const params = new URLSearchParams({
      offset: String(offset),
      limit: String(limit),
    });
    if (this.config.columns.length) {
      params.set("columns", this.config.columns.join(","));
    }
    for (const f of this.config.filters ?? []) {
      params.append("filter", `${f.field}|${f.operator}|${String(f.value)}`);
    }
    return `${this.baseUrl}/api/resources/export?${params.toString()}`;
  }

  private fetchChunk(chunkIndex: number): Promise<Response> {
    const offset = chunkIndex * CHUNK_SIZE;
    const limit = Math.min(CHUNK_SIZE, this.maxRows - offset);
    return this.fetchFn(this.buildUrl(offset, limit), {
      signal: this.controller.signal,
      // The browser manages Accept-Encoding (gzip) itself; setting it here is a
      // no-op forbidden header, so we only advertise the body type we want.
      headers: { Accept: "application/x-ndjson" },
    });
  }

  /** Encode and buffer output, flushing to the writer past the memory guard. */
  private async enqueue(text: string): Promise<void> {
    const bytes = new TextEncoder().encode(text);
    this.buffer.push(bytes);
    this.bufferBytes += bytes.byteLength;
    if (this.bufferBytes >= MEMORY_FLUSH_THRESHOLD) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (!this.buffer.length || !this.writer) return;
    const merged = new Uint8Array(this.bufferBytes);
    let offset = 0;
    for (const part of this.buffer) {
      merged.set(part, offset);
      offset += part.byteLength;
    }
    this.buffer = [];
    this.bufferBytes = 0;
    await this.writer.write(merged);
    this.bytesWritten = this.writer.bytesWritten;
  }

  private async writeRow(row: ResourceRow): Promise<void> {
    const cols = this.config.columns;
    switch (this.config.format) {
      case "csv": {
        const columns = cols.length ? cols : Object.keys(row);
        if (!this.csvHeaderWritten) {
          await this.enqueue(csvHeader(columns));
          this.csvHeaderWritten = true;
        }
        await this.enqueue(csvTransformer(row, columns));
        break;
      }
      case "geojson": {
        const prefix = this.geoJsonStarted ? "," : "";
        this.geoJsonStarted = true;
        await this.enqueue(
          prefix + geoJsonTransformerString(row, cols, this.geometry)
        );
        break;
      }
      case "shapefile": {
        // Shapefiles must be serialised at the end (header carries lengths);
        // accumulate point records now and emit the zip on finalize.
        if (!this.shapefileWriter) {
          this.shapefileWriter = new ShapefilePointWriter(
            this.shapefileFields(row)
          );
        }
        const rec = shapefileTransformer(row, cols, this.geometry);
        this.shapefileWriter.addPoint(rec.lon, rec.lat, rec.attributes);
        break;
      }
    }
    this.rowsWritten += 1;
  }

  private shapefileFields(sampleRow: ResourceRow): ShapefileField[] {
    const cols = this.config.columns.length
      ? this.config.columns
      : Object.keys(sampleRow);
    const types = this.deps.shapefileFieldTypes ?? {};
    return cols
      .filter(
        (c) => c !== this.geometry.lonField && c !== this.geometry.latField
      )
      // DBF field names are capped at 10 chars; keep the projection order.
      .map((c) => ({ name: c.slice(0, 10), type: types[c] ?? "C" }));
  }

  /** Run the export end to end. Resolves when the file is fully written. */
  async run(): Promise<void> {
    const tracer = getTracer();
    const span = tracer.startSpan("ExportPipeline.run");
    span.setAttributes({
      "export.format": this.config.format,
      "export.columns": this.config.columns.join(","),
      "export.max_rows": this.maxRows,
    });

    return tracer.withSpanAsync(span, async () => {
      const meta = FORMAT_META[this.config.format];
      const baseName = this.config.fileName ?? "resource-export";

      this.writer = await this.createWriter({
        fileName: `${baseName}${meta.extension}`,
        mimeType: meta.mimeType,
        description: meta.description,
        extensions: [meta.extension],
        onWarning: (message) => this.emit({ type: "warning", message }),
      });

      if (this.config.format === "geojson") {
        await this.enqueue('{"type":"FeatureCollection","features":[');
      }

      const filters = this.config.filters ?? [];
      const inflight = new Map<number, Promise<Response>>();
      let nextToFetch = 0;
      let ended = false;

      const prime = () => {
        while (
          inflight.size < PREFETCH_WINDOW &&
          nextToFetch < this.totalChunks &&
          !ended
        ) {
          inflight.set(nextToFetch, this.fetchChunk(nextToFetch));
          nextToFetch += 1;
        }
      };

      try {
        prime();

        for (let chunk = 0; chunk < this.totalChunks && !ended; chunk++) {
          if (this.cancelled) break;
          const responsePromise = inflight.get(chunk);
          inflight.delete(chunk);
          if (!responsePromise) break;

          this.emit({
            type: "chunkStart",
            chunk,
            totalChunks: this.totalChunks,
          });

          const response = await responsePromise;
          if (!response.ok) {
            throw new Error(`Export chunk ${chunk} failed: HTTP ${response.status}`);
          }
          if (!response.body) {
            ended = true;
            break;
          }

          let rowsInChunk = 0;
          const gzip = (response.headers.get("content-encoding") ?? "").includes(
            "gzip"
          );
          for await (const row of parseNdjsonStream(response.body, {
            gzip,
            signal: this.controller.signal,
            onBytes: (n) => {
              this.bytesDownloaded += n;
            },
          })) {
            rowsInChunk += 1;
            if (filters.length && !matchesFilters(row, filters)) continue;
            if (this.rowsWritten >= this.maxRows) {
              ended = true;
              break;
            }
            await this.writeRow(row);
          }

          this.emit({
            type: "chunkComplete",
            chunk,
            rowsWritten: this.rowsWritten,
            bytesDownloaded: this.bytesDownloaded,
            bytesWritten: this.bytesWritten + this.bufferBytes,
          });

          // A short chunk means the dataset is exhausted.
          if (rowsInChunk < CHUNK_SIZE) ended = true;
          if (!ended) prime();
        }

        if (this.cancelled) {
          await this.abortWriter(inflight);
          this.emit({ type: "cancelled" });
          span.setStatus({ code: "OK", message: "cancelled" });
          return;
        }

        await this.finalize(baseName);
        await this.drain(inflight);

        this.emit({
          type: "complete",
          rowsWritten: this.rowsWritten,
          bytesWritten: this.bytesWritten,
        });
        span.setStatus("OK");
      } catch (err) {
        span.recordException(err as Error);
        await this.abortWriter(inflight);
        if ((err as Error)?.name === "AbortError" || this.cancelled) {
          this.emit({ type: "cancelled" });
          return;
        }
        this.emit({ type: "error", message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    });
  }

  private async finalize(baseName: string): Promise<void> {
    if (this.config.format === "geojson") {
      await this.enqueue("]}");
    }
    if (this.config.format === "shapefile" && this.shapefileWriter) {
      const components = this.shapefileWriter.build();
      const zip = createStoredZip(buildShapefileZipEntries(components, baseName));
      this.buffer.push(zip);
      this.bufferBytes += zip.byteLength;
    }
    await this.flush();
    if (this.writer) {
      await this.writer.close();
      this.bytesWritten = this.writer.bytesWritten;
    }
  }

  private async abortWriter(inflight: Map<number, Promise<Response>>): Promise<void> {
    await this.writer?.abort().catch(() => {});
    await this.drain(inflight);
  }

  /** Discard any prefetched-but-unused response bodies. */
  private async drain(inflight: Map<number, Promise<Response>>): Promise<void> {
    for (const promise of inflight.values()) {
      try {
        const res = await promise;
        await res.body?.cancel().catch(() => {});
      } catch {
        // Aborted/failed prefetches are expected here.
      }
    }
    inflight.clear();
  }
}

/** Convenience factory mirroring the class constructor. */
export function createExportPipeline(
  config: ExportConfig,
  deps?: ExportPipelineDeps
): ExportPipeline {
  return new ExportPipeline(config, deps);
}
