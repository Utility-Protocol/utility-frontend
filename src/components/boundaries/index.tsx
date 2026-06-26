"use client";

import type { ReactNode } from "react";
import { DomainBoundary } from "@/components/boundaries/DomainBoundary";
import { SkeletonLoader, CompositeSkeleton } from "@/components/boundaries/Skeletons";
import { CascadeProvider, useCascade } from "@/components/boundaries/CascadeContext";

/**
 * Named per-domain boundaries (isolated) and the two composite boundaries
 * (dashboard, map) that coordinate the fallback cascade.
 */

export { ErrorBoundary } from "@/components/boundaries/ErrorBoundary";
export { ErrorPanel } from "@/components/boundaries/ErrorPanel";
export { SkeletonLoader, CompositeSkeleton } from "@/components/boundaries/Skeletons";
export { DomainBoundary } from "@/components/boundaries/DomainBoundary";
export {
  CascadeProvider,
  CascadeGate,
  useCascade,
} from "@/components/boundaries/CascadeContext";

// --- Primary domain boundaries (standalone, error-isolated) -----------------

export function BlockchainBoundary({ children }: { children: ReactNode }) {
  return (
    <DomainBoundary
      groups={["blockchain"]}
      fallback={<SkeletonLoader domain="blockchain" />}
      errorTitle="Contract state unavailable"
    >
      {children}
    </DomainBoundary>
  );
}

export function TelemetryBoundary({ children }: { children: ReactNode }) {
  return (
    <DomainBoundary
      groups={["telemetry"]}
      fallback={<SkeletonLoader domain="telemetry" />}
      errorTitle="Telemetry stream unavailable"
    >
      {children}
    </DomainBoundary>
  );
}

export function MetadataBoundary({ children }: { children: ReactNode }) {
  return (
    <DomainBoundary
      groups={["metadata"]}
      fallback={<SkeletonLoader domain="metadata" />}
      errorTitle="Metadata unavailable"
    >
      {children}
    </DomainBoundary>
  );
}

export function SpatialBoundary({ children }: { children: ReactNode }) {
  return (
    <DomainBoundary
      groups={["spatial"]}
      fallback={<SkeletonLoader domain="spatial" />}
      errorTitle="Map tiles unavailable"
    >
      {children}
    </DomainBoundary>
  );
}

// --- Composite boundaries ---------------------------------------------------

function DashboardBoundaryInner({ children }: { children: ReactNode }) {
  const { block, reset } = useCascade();
  return (
    <DomainBoundary
      groups={["blockchain", "telemetry"]}
      fallback={<CompositeSkeleton domains={["blockchain", "telemetry"]} />}
      errorTitle="Dashboard data unavailable"
      onError={block}
      onRetry={reset}
    >
      {children}
    </DomainBoundary>
  );
}

/**
 * Composite of the blockchain + telemetry domains. A critical blockchain error
 * surfaces a single dashboard error panel; because the shared boundary unmounts
 * its subtree, the telemetry resource never fetches (and `useCascade().blocked`
 * is set for any descendant that needs to know).
 */
export function DashboardBoundary({ children }: { children: ReactNode }) {
  return (
    <CascadeProvider>
      <DashboardBoundaryInner>{children}</DashboardBoundaryInner>
    </CascadeProvider>
  );
}

/** Composite of the metadata + spatial domains. */
export function MapBoundary({ children }: { children: ReactNode }) {
  return (
    <DomainBoundary
      groups={["metadata", "spatial"]}
      fallback={<CompositeSkeleton domains={["metadata", "spatial"]} />}
      errorTitle="Map data unavailable"
    >
      {children}
    </DomainBoundary>
  );
}
