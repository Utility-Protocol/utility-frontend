"use client";

import { useConnectionState } from "@/store/slices/connectionSlice";
import {
  MAX_RECONNECT_ATTEMPTS,
  type ConnectionQuality,
  type ConnectionStatus,
} from "@/types/connection";

/**
 * Fixed top bar showing live connection quality (green / yellow / red). It
 * reads {@link useConnectionState} and surfaces reconnection progress, plus a
 * persistent error banner once the reconnection stratum gives up.
 */

const QUALITY_STYLES: Record<
  ConnectionQuality,
  { dot: string; bar: string; label: string }
> = {
  good: { dot: "bg-green-500", bar: "bg-green-500/10 text-green-600", label: "Connected" },
  degraded: {
    dot: "bg-amber-500 animate-pulse",
    bar: "bg-amber-500/10 text-amber-600",
    label: "Unstable",
  },
  down: { dot: "bg-red-500", bar: "bg-red-500/10 text-red-600", label: "Disconnected" },
};

function statusLabel(status: ConnectionStatus, attempt: number): string {
  switch (status) {
    case "connected":
      return "Live";
    case "connecting":
      return "Connecting…";
    case "reconnecting":
      return `Reconnecting (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})…`;
    case "recovering":
      return "Recovering subscription…";
    case "failed":
      return "Connection lost";
    default:
      return "Idle";
  }
}

export interface ConnectionStatusBarProps {
  /** Optional retry handler wired to the failure banner. */
  onRetry?: () => void;
  className?: string;
}

export function ConnectionStatusBar({ onRetry, className }: ConnectionStatusBarProps) {
  const { status, quality, latency, nodeId, attempt, lastError } =
    useConnectionState();

  const styles = QUALITY_STYLES[quality];
  const failed = status === "failed";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed inset-x-0 top-0 z-50 ${className ?? ""}`}
    >
      <div
        className={`flex items-center justify-between gap-3 px-4 py-1.5 text-xs font-medium ${styles.bar} border-b border-border backdrop-blur-sm`}
      >
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`inline-block h-2.5 w-2.5 rounded-full ${styles.dot}`}
          />
          <span>{statusLabel(status, attempt)}</span>
          {nodeId && (
            <span className="text-muted-foreground">· node {nodeId}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground">
          {status === "connected" && latency >= 0 && (
            <span>{latency === 0 ? "stable" : `${latency} ms drift`}</span>
          )}
          <span className="sr-only">Link quality: {styles.label}</span>
        </div>
      </div>

      {failed && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 border-b border-red-500/30 bg-red-500/15 px-4 py-2 text-xs text-red-600"
        >
          <span>
            {lastError ??
              `Reconnection failed after ${MAX_RECONNECT_ATTEMPTS} attempts.`}{" "}
            Telemetry is paused.
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="rounded-md border border-red-500/40 px-3 py-1 font-medium text-red-600 transition-colors hover:bg-red-500/10"
            >
              Retry now
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default ConnectionStatusBar;
