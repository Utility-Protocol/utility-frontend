"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { TelemetryDataStore } from "@/utils/telemetry/dataStore";
import type { ChartPoint } from "@/utils/telemetry/types";

const DEFAULT_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"];

export interface ResourceTelemetryChartProps {
  /** Mutable data store to render (read every animation frame). */
  store: TelemetryDataStore | null;
  /** Fixed pixel height of the chart area. @default 200 */
  height?: number;
  /** Stroke color per series. */
  colors?: string[];
  /** Optional legend labels per series. */
  labels?: string[];
}

interface PlotPoint {
  x: number;
  y: number;
  synthetic: boolean;
  /** true for NaN sentinels => break the line. */
  gap: boolean;
}

interface SegmentPoint {
  x: number;
  y: number;
}

export interface DrawOptions {
  width: number;
  height: number;
  colors?: string[];
  padding?: number;
  labels?: string[];
}

/**
 * Pure renderer for a multi-line telemetry chart.
 *
 * - `NaN` values act as gap separators: the line is broken into disconnected
 *   segments (this is how the 300-frame cap's sentinel is visualised).
 * - `synthetic` points are stroked dashed and at reduced opacity so
 *   interpolated/decimated data is visually distinguishable from live data.
 *
 * Extracted from the component so it can be unit-tested with a fake context.
 */
export function drawTelemetry(
  ctx: CanvasRenderingContext2D,
  datasets: ChartPoint[][],
  opts: DrawOptions
): void {
  const { width, height } = opts;
  const colors = opts.colors ?? DEFAULT_COLORS;
  const padding = opts.padding ?? 10;

  ctx.clearRect(0, 0, width, height);

  // Compute a shared value range across every series (ignoring NaN sentinels).
  let min = Infinity;
  let max = -Infinity;
  for (const ds of datasets) {
    if (!ds) continue;
    for (const p of ds) {
      if (Number.isNaN(p.value)) continue;
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    min = 0;
    max = 100;
  }
  if (max - min < 1e-9) {
    max = min + 1;
  }
  const range = max - min;
  const plotHeight = height - 2 * padding;

  for (let s = 0; s < datasets.length; s++) {
    const ds = datasets[s];
    if (!ds || ds.length === 0) continue;
    const color = colors[s % colors.length];
    const n = ds.length;
    const stepX = n > 1 ? width / (n - 1) : 0;

    const points: PlotPoint[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const p = ds[i];
      if (Number.isNaN(p.value)) {
        points[i] = { x: 0, y: 0, synthetic: false, gap: true };
        continue;
      }
      points[i] = {
        x: i * stepX,
        y: height - padding - ((p.value - min) / range) * plotHeight,
        synthetic: p.synthetic,
        gap: false,
      };
    }

    drawSeriesSegments(ctx, points, color);
  }

  // Legend
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
  if (opts.labels && opts.labels.length > 0) {
    ctx.font = "12px monospace";
    for (let s = 0; s < opts.labels.length; s++) {
      const color = colors[s % colors.length];
      ctx.fillStyle = color;
      ctx.fillRect(8 + s * 120, 6, 10, 10);
      ctx.fillStyle = "var(--foreground)";
      ctx.fillText(opts.labels[s], 24 + s * 120, 15);
    }
  }
}

function drawSeriesSegments(
  ctx: CanvasRenderingContext2D,
  points: PlotPoint[],
  color: string
): void {
  let segment: SegmentPoint[] = [];
  let segmentStyle: "solid" | "dashed" | null = null;
  let last: SegmentPoint | null = null;

  const flush = () => {
    if (segment.length >= 2 && segmentStyle !== null) {
      ctx.beginPath();
      ctx.moveTo(segment[0].x, segment[0].y);
      for (let k = 1; k < segment.length; k++) {
        ctx.lineTo(segment[k].x, segment[k].y);
      }
      if (segmentStyle === "dashed") {
        ctx.setLineDash([5, 4]);
        ctx.globalAlpha = 0.5;
      } else {
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    segment = [];
    segmentStyle = null;
  };

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.gap) {
      flush();
      last = null;
      continue;
    }
    const desired: "solid" | "dashed" = p.synthetic ? "dashed" : "solid";
    if (segmentStyle !== null && segmentStyle !== desired) {
      flush();
    }
    if (segmentStyle === null) {
      segmentStyle = desired;
      if (last) segment.push(last); // keep visual continuity across style change
    }
    segment.push({ x: p.x, y: p.y });
    last = { x: p.x, y: p.y };
  }
  flush();

  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/**
 * Canvas-based multi-line telemetry chart. Reads the provided store every
 * animation frame (so live streaming never triggers React re-renders) and
 * renders gap separators / synthetic points per {@link drawTelemetry}.
 */
export function ResourceTelemetryChart({
  store,
  height = 200,
  colors,
  labels,
}: ResourceTelemetryChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height });
  const rafRef = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDimensions({
          width: Math.floor(entry.contentRect.width),
          height: Math.floor(entry.contentRect.height),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx || !store) return;
    drawTelemetry(ctx, store.datasets, {
      width: dimensions.width,
      height: dimensions.height,
      colors,
      labels,
    });
  }, [dimensions, store, colors, labels]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(function loop() {
      draw();
      rafRef.current = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="relative w-full rounded-xl border border-border overflow-hidden bg-background"
      style={{ height }}
    >
      <canvas
        ref={canvasRef}
        width={dimensions.width}
        height={dimensions.height}
        className="absolute inset-0"
      />
    </div>
  );
}
