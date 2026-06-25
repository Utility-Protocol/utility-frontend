"use client";

import { useMemo } from "react";
import { toDecimalNumber, type Decimal } from "@/utils/decimal";

/**
 * Time-series chart for fixed-point resource data. Charting needs plain
 * `number`s, so each {@link Decimal} is converted exactly once at render time
 * via {@link toDecimalNumber} (which warns on precision loss). The exact Decimal
 * is preserved for the headline total, which is formatted with `toFixed`.
 */

export interface ResourceChartPoint {
  /** Unix milliseconds. */
  timestamp: number;
  value: Decimal;
}

export interface ResourceChartProps {
  points: ResourceChartPoint[];
  /** Display unit (e.g. "kWh"). */
  unit?: string;
  height?: number;
  /** Stroke color. */
  color?: string;
  className?: string;
}

const PADDING = 6;

export function ResourceChart({
  points,
  unit = "",
  height = 160,
  color = "#22c55e",
  className,
}: ResourceChartProps) {
  // Convert exactly once; toDecimalNumber warns if a value can't be represented.
  const numeric = useMemo(
    () => points.map((p) => ({ t: p.timestamp, y: toDecimalNumber(p.value) })),
    [points]
  );

  const { path, minY, maxY } = useMemo(() => {
    if (numeric.length === 0) {
      return { path: "", minY: 0, maxY: 0 };
    }
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of numeric) {
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
    if (lo === hi) {
      hi = lo + 1;
    }
    const w = 100;
    const h = height - PADDING * 2;
    const n = numeric.length;
    const d = numeric
      .map((p, i) => {
        const x = n === 1 ? w / 2 : (i / (n - 1)) * w;
        const y = PADDING + h - ((p.y - lo) / (hi - lo)) * h;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    return { path: d, minY: lo, maxY: hi };
  }, [numeric, height]);

  // The headline value stays exact (formatted from the Decimal, not the float).
  const latest = points.length ? points[points.length - 1].value.toFixed() : null;

  if (points.length === 0) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-border bg-muted text-sm text-muted-foreground ${
          className ?? ""
        }`}
        style={{ height }}
      >
        No data
      </div>
    );
  }

  return (
    <div className={`rounded-lg border border-border bg-background p-3 ${className ?? ""}`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-sm font-semibold tabular-nums">
          {latest}
          {unit && <span className="ml-1 text-xs text-muted-foreground">{unit}</span>}
        </span>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {minY.toFixed(2)} – {maxY.toFixed(2)}
        </span>
      </div>
      <svg
        viewBox={`0 0 100 ${height}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Resource time series in ${unit || "units"}`}
      >
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

export default ResourceChart;
