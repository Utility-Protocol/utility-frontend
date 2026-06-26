"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

/**
 * Fallback-cascade context. A composite boundary blocks its subtree when a
 * critical child fails, so downstream resources can skip fetching (saving
 * bandwidth) rather than each showing their own loader.
 */

export interface CascadeValue {
  blocked: boolean;
  block: () => void;
  reset: () => void;
}

const CascadeContext = createContext<CascadeValue>({
  blocked: false,
  block: () => {},
  reset: () => {},
});

export function CascadeProvider({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(false);
  const value = useMemo<CascadeValue>(
    () => ({ blocked, block: () => setBlocked(true), reset: () => setBlocked(false) }),
    [blocked]
  );
  return <CascadeContext.Provider value={value}>{children}</CascadeContext.Provider>;
}

export function useCascade(): CascadeValue {
  return useContext(CascadeContext);
}

/**
 * Renders `children` only when the cascade is not blocked; otherwise renders
 * `whenBlocked` (default: nothing) — used to skip telemetry fetching when the
 * blockchain boundary has failed.
 */
export function CascadeGate({
  children,
  whenBlocked = null,
}: {
  children: ReactNode;
  whenBlocked?: ReactNode;
}) {
  const { blocked } = useCascade();
  return <>{blocked ? whenBlocked : children}</>;
}
