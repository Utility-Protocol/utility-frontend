"use client";

/** Error fallback with a Retry action, shown when a boundary catches an error. */

export interface ErrorPanelProps {
  title: string;
  error: Error;
  onRetry: () => void;
  className?: string;
}

export function ErrorPanel({ title, error, onRetry, className }: ErrorPanelProps) {
  return (
    <div
      role="alert"
      className={`rounded-xl border border-red-500/30 bg-red-500/10 p-4 ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-red-600">{title}</p>
          <p className="mt-1 truncate text-xs text-red-500/90" title={error.message}>
            {error.message}
          </p>
        </div>
        <button
          onClick={onRetry}
          className="shrink-0 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-500/10"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
