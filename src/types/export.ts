/**
 * Types and bounds for the client-side bulk export pipeline.
 *
 * Filtered resource-consumption data is streamed from the REST API in chunked,
 * gzipped NDJSON requests, transformed into CSV / GeoJSON / shapefile, and
 * written to disk via the File System Access API (or a Blob download fallback)
 * without ever holding the whole dataset in memory.
 */

export type ExportFormat = "csv" | "geojson" | "shapefile";

/** Rows per REST request. */
export const CHUNK_SIZE = 10_000;
/** Hard cap on chunks → 1,000,000 rows total export limit. */
export const MAX_CHUNKS = 100;
export const MAX_ROWS = CHUNK_SIZE * MAX_CHUNKS;

/** Flush buffered output to disk once it exceeds this many bytes. */
export const MEMORY_FLUSH_THRESHOLD = 50 * 1024 * 1024;
/** Max bytes to accumulate before the Blob fallback warns about memory. */
export const FALLBACK_MEMORY_LIMIT = 100 * 1024 * 1024;

/** Decimal places GeoJSON/shapefile coordinates are truncated to (~0.11 m). */
export const COORD_PRECISION = 6;

/** Number of chunks fetched ahead of processing (sliding window). */
export const PREFETCH_WINDOW = 2;

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains";

export interface ExportFilter {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean;
}

export interface ExportConfig {
  format: ExportFormat;
  /** Projected columns, in output order. Empty = all columns from the schema. */
  columns: string[];
  filters?: ExportFilter[];
  /** Upper bound on exported rows; clamped to {@link MAX_ROWS}. */
  maxRows?: number;
  /** Longitude property name for geometry formats. @default "longitude" */
  lonField?: string;
  /** Latitude property name for geometry formats. @default "latitude" */
  latField?: string;
  /** Suggested download file name (without extension). */
  fileName?: string;
}

/** A single parsed NDJSON row from the export endpoint. */
export type ResourceRow = Record<string, unknown>;

/** A column definition from GET /api/resources/schema. */
export interface SchemaColumn {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  label?: string;
}

export type ExportStatus =
  | "idle"
  | "preparing"
  | "exporting"
  | "finalizing"
  | "complete"
  | "cancelled"
  | "error";

export interface ExportProgress {
  status: ExportStatus;
  currentChunk: number;
  totalChunks: number | null;
  bytesDownloaded: number;
  rowsWritten: number;
  bytesWritten: number;
  /** True when the Blob download fallback is in use (no FS Access API). */
  usedFallback: boolean;
  /** Non-fatal warning, e.g. memory pressure on the fallback path. */
  warning: string | null;
  error: string | null;
}

/** Events emitted by the pipeline and surfaced through {@link ExportProgress}. */
export type ExportEvent =
  | { type: "chunkStart"; chunk: number; totalChunks: number | null }
  | {
      type: "chunkComplete";
      chunk: number;
      rowsWritten: number;
      bytesDownloaded: number;
      bytesWritten: number;
    }
  | { type: "warning"; message: string }
  | { type: "complete"; rowsWritten: number; bytesWritten: number }
  | { type: "cancelled" }
  | { type: "error"; message: string };

export type ExportEventListener = (event: ExportEvent) => void;
