"use client";

import { useMemo } from "react";
import {
  DashboardBoundary,
  MapBoundary,
} from "@/components/boundaries";
import { createResource } from "@/utils/suspenseResource";
import { useSuspenseResource } from "@/hooks/useSuspenseResource";
import {
  CACHE_TTL_MS,
  domainCacheKey,
  type SuspenseResource,
} from "@/types/suspense";

/**
 * Top-level page composing the Suspense boundaries with proper nesting:
 *   DashboardBoundary { blockchain + telemetry }  (critical-cascade)
 *   MapBoundary       { metadata + spatial }
 *
 * (The blueprint names `src/pages/Dashboard.tsx`, but this is an App Router
 * project, so it ships as a component to avoid a Pages Router conflict.)
 */

export interface DashboardData {
  blockchain: SuspenseResource<{ ledger: number }>;
  telemetry: SuspenseResource<{ readings: number }>;
  metadata: SuspenseResource<{ tariffs: number }>;
  spatial: SuspenseResource<{ tiles: number }>;
}

export interface DashboardPageProps {
  /** Inject resources (tests / real wiring); defaults are demo stubs. */
  resources?: DashboardData;
}

function defaultResources(): DashboardData {
  const stub = <T,>(domain: Parameters<typeof domainCacheKey>[0], value: T) =>
    createResource<T>(() => Promise.resolve(value), {
      cacheKey: domainCacheKey(domain, "summary"),
      ttlMs: CACHE_TTL_MS[domain],
    });
  return {
    blockchain: stub("blockchain", { ledger: 0 }),
    telemetry: stub("telemetry", { readings: 0 }),
    metadata: stub("metadata", { tariffs: 0 }),
    spatial: stub("spatial", { tiles: 0 }),
  };
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function BlockchainSection({ resource }: { resource: DashboardData["blockchain"] }) {
  const data = useSuspenseResource(resource);
  return <Stat label="Latest ledger" value={data.ledger} />;
}
function TelemetrySection({ resource }: { resource: DashboardData["telemetry"] }) {
  const data = useSuspenseResource(resource);
  return <Stat label="Live readings" value={data.readings} />;
}
function MetadataSection({ resource }: { resource: DashboardData["metadata"] }) {
  const data = useSuspenseResource(resource);
  return <Stat label="Tariffs" value={data.tariffs} />;
}
function SpatialSection({ resource }: { resource: DashboardData["spatial"] }) {
  const data = useSuspenseResource(resource);
  return <Stat label="Cached tiles" value={data.tiles} />;
}

export function DashboardPage({ resources }: DashboardPageProps) {
  const data = useMemo(() => resources ?? defaultResources(), [resources]);

  return (
    <div className="space-y-6">
      <DashboardBoundary>
        <div className="grid grid-cols-2 gap-3">
          <BlockchainSection resource={data.blockchain} />
          <TelemetrySection resource={data.telemetry} />
        </div>
      </DashboardBoundary>

      <MapBoundary>
        <div className="grid grid-cols-2 gap-3">
          <MetadataSection resource={data.metadata} />
          <SpatialSection resource={data.spatial} />
        </div>
      </MapBoundary>
    </div>
  );
}

export default DashboardPage;
