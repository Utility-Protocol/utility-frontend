"use client";

import { useRef, useEffect, type ReactNode } from "react";
import { useContainerSize } from "@/hooks/useContainerSize";

interface ChartSlot {
  key: string;
  title: string;
  content: ReactNode;
  /** Optional callback when container dimensions change (e.g., chart.resize()) */
  onResize?: (width: number, height: number) => void;
}

interface ChartsAreaProps {
  charts: ChartSlot[];
}

/**
 * CSS Container-query-driven Charts Area.
 *
 * Layout (grid vs stacked) and aspect-ratio are driven by @container
 * queries in containers.css. The `useContainerSize` hook is used only
 * to provide dimension data to imperative charting libraries (Recharts,
 * Chart.js, etc.) that need to call `.resize()`.
 */
export function ChartsArea({ charts }: ChartsAreaProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, height } = useContainerSize(ref, {
    compactMax: 500,
    expandedMin: 500,
  });

  // Notify each chart of dimension changes
  useEffect(() => {
    for (const chart of charts) {
      chart.onResize?.(width, height);
    }
  }, [width, height, charts]);

  return (
    <div ref={ref} className="container-charts-area charts-responsive p-4">
      {charts.map((chart) => (
        <div
          key={chart.key}
          className="chart-wrapper relative rounded-xl border border-border bg-background p-4"
        >
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">
            {chart.title}
          </h3>
          {chart.content}
        </div>
      ))}

      {charts.length === 0 && (
        <div className="flex items-center justify-center col-span-full py-12 text-sm text-muted-foreground">
          No charts configured
        </div>
      )}
    </div>
  );
}
