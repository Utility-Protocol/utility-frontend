"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ExportConfig,
  ExportFilter,
  ExportFormat,
  FilterOperator,
  SchemaColumn,
} from "@/types/export";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { MAX_ROWS } from "@/types/export";
import {
  useExportProgress,
  type UseExportProgressReturn,
} from "@/hooks/useExportProgress";
import type { ExportPipelineDeps } from "@/services/exportPipeline";

const FORMAT_OPTIONS: { value: ExportFormat; label: string }[] = [
  { value: "csv", label: "CSV" },
  { value: "geojson", label: "GeoJSON" },
  { value: "shapefile", label: "Shapefile (zipped)" },
];

const OPERATORS: { value: FilterOperator; label: string }[] = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "contains", label: "contains" },
];

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
  /** Override the schema fetch (defaults to GET /api/resources/schema). */
  fetchSchema?: () => Promise<SchemaColumn[]>;
  /** Injected pipeline dependencies (for testing / custom transport). */
  pipelineDeps?: ExportPipelineDeps;
  /** Override the progress hook (for testing). */
  progress?: UseExportProgressReturn;
  baseUrl?: string;
}

async function defaultFetchSchema(baseUrl: string): Promise<SchemaColumn[]> {
  const url = `${baseUrl}/api/resources/schema`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Schema request failed: HTTP ${res.status}`);
  return (await res.json()) as SchemaColumn[];
}

export function ExportDialog({
  open,
  onClose,
  fetchSchema,
  pipelineDeps,
  progress: progressOverride,
  baseUrl,
}: ExportDialogProps) {
  const { flags } = useFeatureFlags();
  const resolvedBaseUrl =
    baseUrl ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

  const internal = useExportProgress(pipelineDeps);
  const { progress, start, cancel, reset, isRunning } =
    progressOverride ?? internal;

  const [schema, setSchema] = useState<SchemaColumn[]>([]);
  const [schemaError, setSchemaError] = useState<string | null>(null);
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [filters, setFilters] = useState<ExportFilter[]>([]);

  // Load the column schema when the dialog opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = fetchSchema ?? (() => defaultFetchSchema(resolvedBaseUrl));
    load()
      .then((cols) => {
        if (cancelled) return;
        setSchema(cols);
        setSelectedColumns(cols.map((c) => c.name));
        setSchemaError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setSchemaError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, fetchSchema, resolvedBaseUrl]);

  // Close on Escape (unless an export is running).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isRunning) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, isRunning, onClose]);

  const toggleColumn = useCallback((name: string) => {
    setSelectedColumns((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }, []);

  const addFilter = useCallback(() => {
    const first = schema[0]?.name ?? "";
    setFilters((prev) => [...prev, { field: first, operator: "eq", value: "" }]);
  }, [schema]);

  const updateFilter = useCallback(
    (index: number, patch: Partial<ExportFilter>) => {
      setFilters((prev) =>
        prev.map((f, i) => (i === index ? { ...f, ...patch } : f))
      );
    },
    []
  );

  const removeFilter = useCallback((index: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const percent = useMemo(() => {
    if (!progress.totalChunks) return 0;
    return Math.min(
      100,
      Math.round((progress.currentChunk / progress.totalChunks) * 100)
    );
  }, [progress.currentChunk, progress.totalChunks]);

  const handleExport = useCallback(() => {
    const config: ExportConfig = {
      format,
      columns: selectedColumns,
      filters: filters.filter((f) => f.field),
      maxRows: MAX_ROWS,
      fileName: "resource-export",
    };
    void start(config);
  }, [format, selectedColumns, filters, start]);

  const handleClose = useCallback(() => {
    if (isRunning) cancel();
    reset();
    onClose();
  }, [isRunning, cancel, reset, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border border-border bg-background p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 id="export-dialog-title" className="text-lg font-semibold">
            Bulk Export
          </h2>
          <button
            onClick={handleClose}
            className="text-muted-foreground hover:text-foreground transition-colors text-sm"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {schemaError && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-500">
            Could not load column schema: {schemaError}
          </div>
        )}

        {!flags.heavyWeightTasks && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-500 animate-pulse">
            ⚠️ <strong>Capacity Shedding Active:</strong> Bulk exporting is temporarily suspended to guarantee low latency on critical operator tasks.
          </div>
        )}

        {/* Format selector */}
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ExportFormat)}
            disabled={isRunning}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
          >
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>

        {/* Column picker */}
        <fieldset className="space-y-2" disabled={isRunning}>
          <legend className="text-sm font-medium">Columns</legend>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 max-h-40 overflow-y-auto rounded-lg border border-border p-2">
            {schema.length === 0 && (
              <span className="text-xs text-muted-foreground col-span-full">
                Loading columns…
              </span>
            )}
            {schema.map((col) => (
              <label
                key={col.name}
                className="flex items-center gap-2 text-sm cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedColumns.includes(col.name)}
                  onChange={() => toggleColumn(col.name)}
                  className="accent-foreground"
                />
                <span className="truncate" title={col.name}>
                  {col.label ?? col.name}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {/* Filter builder */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Filters</span>
            <button
              onClick={addFilter}
              disabled={isRunning || schema.length === 0}
              className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-accent transition-colors disabled:opacity-50"
            >
              + Add filter
            </button>
          </div>
          {filters.map((filter, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={filter.field}
                onChange={(e) => updateFilter(i, { field: e.target.value })}
                disabled={isRunning}
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                {schema.map((col) => (
                  <option key={col.name} value={col.name}>
                    {col.label ?? col.name}
                  </option>
                ))}
              </select>
              <select
                value={filter.operator}
                onChange={(e) =>
                  updateFilter(i, {
                    operator: e.target.value as FilterOperator,
                  })
                }
                disabled={isRunning}
                className="rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>
              <input
                value={String(filter.value)}
                onChange={(e) => updateFilter(i, { value: e.target.value })}
                disabled={isRunning}
                placeholder="value"
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                onClick={() => removeFilter(i)}
                disabled={isRunning}
                className="text-muted-foreground hover:text-red-500 transition-colors text-sm px-1 disabled:opacity-50"
                aria-label="Remove filter"
              >
                ✕
              </button>
            </div>
          ))}
        </div>

        {/* Progress */}
        {progress.status !== "idle" && (
          <div className="space-y-2">
            <div
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full transition-all duration-300 ${
                  progress.status === "error"
                    ? "bg-red-500"
                    : progress.status === "complete"
                    ? "bg-green-500"
                    : "bg-foreground"
                }`}
                style={{ width: `${progress.status === "complete" ? 100 : percent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>
                {progress.status === "complete"
                  ? `Done — ${progress.rowsWritten.toLocaleString()} rows`
                  : progress.status === "error"
                  ? progress.error ?? "Export failed."
                  : progress.status === "cancelled"
                  ? "Export cancelled."
                  : `Chunk ${progress.currentChunk}/${
                      progress.totalChunks ?? "?"
                    } — ${progress.rowsWritten.toLocaleString()} rows`}
              </span>
              <span>
                {(progress.bytesDownloaded / (1024 * 1024)).toFixed(1)} MB in
              </span>
            </div>
            {progress.warning && (
              <p className="text-xs text-amber-500">{progress.warning}</p>
            )}
            {progress.usedFallback && (
              <p className="text-xs text-muted-foreground">
                Using in-memory download (File System Access API unavailable).
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          {isRunning ? (
            <button
              onClick={cancel}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
              >
                Close
              </button>
              <button
                onClick={handleExport}
                disabled={selectedColumns.length === 0 || !flags.heavyWeightTasks}
                className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Export
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ExportDialog;
