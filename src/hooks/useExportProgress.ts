"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ExportConfig, ExportProgress } from "@/types/export";
import {
  ExportPipeline,
  type ExportPipelineDeps,
} from "@/services/exportPipeline";

const INITIAL_PROGRESS: ExportProgress = {
  status: "idle",
  currentChunk: 0,
  totalChunks: null,
  bytesDownloaded: 0,
  rowsWritten: 0,
  bytesWritten: 0,
  usedFallback: false,
  warning: null,
  error: null,
};

export interface UseExportProgressReturn {
  progress: ExportProgress;
  /** Begin an export; resolves when finished, cancelled or errored. */
  start: (config: ExportConfig) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  isRunning: boolean;
}

/**
 * React binding over {@link ExportPipeline}. Subscribes to pipeline events
 * (chunkStart, chunkComplete, warning, complete, cancelled, error) and reduces
 * them into a single {@link ExportProgress} object for the UI.
 */
export function useExportProgress(
  deps?: ExportPipelineDeps
): UseExportProgressReturn {
  const [progress, setProgress] = useState<ExportProgress>(INITIAL_PROGRESS);
  const pipelineRef = useRef<ExportPipeline | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      pipelineRef.current?.cancel();
    };
  }, []);

  const update = useCallback((patch: Partial<ExportProgress>) => {
    if (!mountedRef.current) return;
    setProgress((prev) => ({ ...prev, ...patch }));
  }, []);

  const start = useCallback(
    async (config: ExportConfig) => {
      if (pipelineRef.current) return; // One export at a time.

      const pipeline = new ExportPipeline(config, deps);
      pipelineRef.current = pipeline;

      setProgress({
        ...INITIAL_PROGRESS,
        status: "preparing",
        totalChunks: pipeline.totalChunks,
      });

      const unsubscribe = pipeline.on((event) => {
        switch (event.type) {
          case "chunkStart":
            update({
              status: "exporting",
              currentChunk: event.chunk + 1,
              totalChunks: event.totalChunks,
              usedFallback: pipeline.usedFallback,
            });
            break;
          case "chunkComplete":
            update({
              rowsWritten: event.rowsWritten,
              bytesDownloaded: event.bytesDownloaded,
              bytesWritten: event.bytesWritten,
              usedFallback: pipeline.usedFallback,
            });
            break;
          case "warning":
            update({ warning: event.message, usedFallback: pipeline.usedFallback });
            break;
          case "complete":
            update({
              status: "complete",
              rowsWritten: event.rowsWritten,
              bytesWritten: event.bytesWritten,
            });
            break;
          case "cancelled":
            update({ status: "cancelled" });
            break;
          case "error":
            update({ status: "error", error: event.message });
            break;
        }
      });

      try {
        await pipeline.run();
      } catch {
        // The "error" event already populated progress.error.
      } finally {
        unsubscribe();
        pipelineRef.current = null;
      }
    },
    [deps, update]
  );

  const cancel = useCallback(() => {
    pipelineRef.current?.cancel();
  }, []);

  const reset = useCallback(() => {
    pipelineRef.current?.cancel();
    pipelineRef.current = null;
    setProgress(INITIAL_PROGRESS);
  }, []);

  const isRunning =
    progress.status === "preparing" ||
    progress.status === "exporting" ||
    progress.status === "finalizing";

  return { progress, start, cancel, reset, isRunning };
}
