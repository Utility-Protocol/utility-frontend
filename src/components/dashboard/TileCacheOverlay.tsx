"use client";

import {
  useTileCacheStats,
  selectHitRatio,
} from "@/store/slices/tileCacheSlice";
import { TILE_CACHE_CAPACITY } from "@/types/tile";

/**
 * Debug overlay surfacing tile-cache health (hit ratio, byte usage, pending
 * downloads). Gated behind a feature flag so it never ships to operators by
 * default.
 */

export interface TileCacheOverlayProps {
  /** Render only when true (the feature flag). */
  enabled?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TileCacheOverlay({ enabled = false }: TileCacheOverlayProps) {
  const stats = useTileCacheStats();
  if (!enabled) return null;

  const hitRatio = selectHitRatio(stats);
  const fill = stats.count / TILE_CACHE_CAPACITY;

  return (
    <div className="pointer-events-none fixed bottom-2 left-2 z-50 rounded-lg border border-border bg-background/90 p-2 font-mono text-[11px] leading-tight shadow-lg backdrop-blur-sm">
      <div className="mb-1 font-semibold">Tile cache</div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span className="text-muted-foreground">hit ratio</span>
        <span className="text-right tabular-nums">{(hitRatio * 100).toFixed(1)}%</span>
        <span className="text-muted-foreground">tiles</span>
        <span className="text-right tabular-nums">
          {stats.count}/{TILE_CACHE_CAPACITY} ({(fill * 100).toFixed(0)}%)
        </span>
        <span className="text-muted-foreground">bytes</span>
        <span className="text-right tabular-nums">{formatBytes(stats.bytes)}</span>
        <span className="text-muted-foreground">evictions</span>
        <span className="text-right tabular-nums">{stats.evictions}</span>
        <span className="text-muted-foreground">pending</span>
        <span className="text-right tabular-nums">{stats.pending}</span>
      </div>
    </div>
  );
}

export default TileCacheOverlay;
