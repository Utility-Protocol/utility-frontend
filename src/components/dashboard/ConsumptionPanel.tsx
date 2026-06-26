"use client";

import { useEffect, useMemo, useState } from "react";
import {
  aggregateReadings,
  perResourceUnits,
  PRECISION_THRESHOLD,
  type Reading,
} from "@/utils/aggregation/resourceMath";
import { RESOURCE_TYPES, type ResourceType } from "@/utils/aggregation/unitConversion";

/**
 * Real-time resource-consumption panel.
 *
 * Aggregation is exact (BigInt); the only conversion to `Number` happens here,
 * at the display tail, formatted with `Intl.NumberFormat`. A subtle badge
 * surfaces the precision audit when the legacy `Number` pipeline would have
 * drifted beyond the tolerance.
 */

const RESOURCE_LABEL: Record<ResourceType, string> = {
  water: "Water",
  energy: "Energy",
  bandwidth: "Bandwidth",
};

export interface ConsumptionPanelProps {
  /** Readings for the current window. */
  readings: Reading[];
  /** Pull a fresh window on an interval (ms); omit for a static snapshot. */
  refreshIntervalMs?: number;
  /** Source for live refreshes (defaults to the static `readings` prop). */
  readingsSource?: () => Reading[];
  className?: string;
}

export function ConsumptionPanel({
  readings,
  refreshIntervalMs,
  readingsSource,
  className,
}: ConsumptionPanelProps) {
  const [window, setWindow] = useState<Reading[]>(readings);

  useEffect(() => {
    setWindow(readings);
  }, [readings]);

  // Dashboard refresh: re-pull the window on the configured interval.
  useEffect(() => {
    if (!refreshIntervalMs || !readingsSource) return;
    const id = setInterval(() => setWindow(readingsSource()), refreshIntervalMs);
    return () => clearInterval(id);
  }, [refreshIntervalMs, readingsSource]);

  const result = useMemo(() => aggregateReadings(window), [window]);
  const byResource = useMemo(() => perResourceUnits(result), [result]);

  const driftDetected = result.relativeError > PRECISION_THRESHOLD;

  return (
    <div
      className={`rounded-xl border border-border bg-background p-6 space-y-4 ${
        className ?? ""
      }`}
    >
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold">Resource Consumption</h3>
          <p className="text-sm text-muted-foreground">
            {result.readingCount.toLocaleString()} readings · unified resource
            units
          </p>
        </div>
        {driftDetected && (
          <span
            className="rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600"
            title={`Legacy Number pipeline drift: ${(result.relativeError * 100).toFixed(4)}% — exact BigInt total shown`}
          >
            precision-corrected
          </span>
        )}
      </div>

      <div className="space-y-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          Total
        </span>
        <p className="text-3xl font-bold tabular-nums" title={result.exactBase.toString()}>
          {result.total.toDisplay(4, 2)}
        </p>
      </div>

      <dl className="grid grid-cols-3 gap-3 pt-2">
        {RESOURCE_TYPES.map((type) => (
          <div key={type} className="rounded-lg border border-border p-3">
            <dt className="text-xs text-muted-foreground">{RESOURCE_LABEL[type]}</dt>
            <dd
              className="mt-1 font-semibold tabular-nums"
              title={result.byResource[type].toString()}
            >
              {byResource[type].toDisplay(4, 2)}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default ConsumptionPanel;
