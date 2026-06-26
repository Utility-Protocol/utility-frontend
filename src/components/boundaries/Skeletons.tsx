"use client";

import type { DomainKey } from "@/types/suspense";

/** Domain-specific skeleton loaders shown as Suspense fallbacks. */

const DOMAIN_LABEL: Record<DomainKey, string> = {
  blockchain: "Loading contract state…",
  telemetry: "Connecting telemetry…",
  metadata: "Loading metadata…",
  spatial: "Loading map tiles…",
};

const DOMAIN_HEIGHT: Record<DomainKey, string> = {
  blockchain: "h-[160px]",
  telemetry: "h-[200px]",
  metadata: "h-[120px]",
  spatial: "h-[300px]",
};

export interface SkeletonProps {
  domain: DomainKey;
  className?: string;
}

export function SkeletonLoader({ domain, className }: SkeletonProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={DOMAIN_LABEL[domain]}
      className={`w-full ${DOMAIN_HEIGHT[domain]} animate-pulse rounded-xl border border-border bg-muted flex items-center justify-center ${
        className ?? ""
      }`}
    >
      <span className="text-sm text-muted-foreground">{DOMAIN_LABEL[domain]}</span>
    </div>
  );
}

/** Composite skeleton (e.g. while a dashboard's children all suspend). */
export function CompositeSkeleton({ domains }: { domains: DomainKey[] }) {
  return (
    <div className="space-y-3">
      {domains.map((d) => (
        <SkeletonLoader key={d} domain={d} />
      ))}
    </div>
  );
}
