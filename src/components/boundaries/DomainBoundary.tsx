"use client";

import { Suspense, useCallback, useState, type ReactNode } from "react";
import { ErrorBoundary } from "@/components/boundaries/ErrorBoundary";
import { ErrorPanel } from "@/components/boundaries/ErrorPanel";
import { cacheStore } from "@/store/slices/cacheSlice";

/**
 * Generic named boundary: an {@link ErrorBoundary} wrapping a `Suspense`.
 *
 * On Retry it invalidates the boundary's cache groups (setting them stale so the
 * next read re-fetches) and remounts via a key bump, which clears the error and
 * re-runs the suspending children.
 */

export interface DomainBoundaryProps {
  /** Cache groups invalidated on retry (e.g. ["blockchain", "telemetry"]). */
  groups: string[];
  /** Suspense fallback (skeleton). */
  fallback: ReactNode;
  errorTitle: string;
  children: ReactNode;
  /** Called when an error is first caught (e.g. to set the cascade flag). */
  onError?: (error: Error) => void;
  /** Called on Retry, before invalidation + remount (e.g. reset the cascade). */
  onRetry?: () => void;
}

export function DomainBoundary({
  groups,
  fallback,
  errorTitle,
  children,
  onError,
  onRetry,
}: DomainBoundaryProps) {
  const [attempt, setAttempt] = useState(0);
  const groupsKey = groups.join(",");

  const retry = useCallback(() => {
    onRetry?.();
    for (const group of groupsKey.split(",")) {
      if (group) cacheStore.invalidateGroup(group);
    }
    setAttempt((a) => a + 1);
  }, [groupsKey, onRetry]);

  return (
    <ErrorBoundary
      key={attempt}
      onError={onError}
      fallback={(error) => (
        <ErrorPanel title={errorTitle} error={error} onRetry={retry} />
      )}
    >
      <Suspense fallback={fallback}>{children}</Suspense>
    </ErrorBoundary>
  );
}
