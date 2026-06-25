"use client";

import { useRef, useEffect, useState, useMemo } from "react";
import {
  RingBuffer,
  StreamBatcher,
  AdaptiveCapacityMonitor,
} from "@/utils/buffer";
import { throttle } from "@/utils/helpers";

function generatePoint(): number {
  return 40 + Math.random() * 60;
}

/**
 * High-frequency live telemetry view.
 *
 * Ingestion and rendering are decoupled: incoming points are accumulated by a
 * {@link StreamBatcher} and flushed into a fixed-capacity {@link RingBuffer}, and
 * the canvas draw loop reads the ring buffer directly each animation frame (no
 * React state on the hot path). An {@link AdaptiveCapacityMonitor} shrinks the
 * retained window when frames run slower than ~30 FPS, so 50+ msg/s bursts no
 * longer saturate the RAF loop.
 */
export function LiveDataView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 200 });

  // Streaming primitives (stable for the component's lifetime).
  const bufferRef = useRef<RingBuffer | null>(null);
  if (!bufferRef.current) bufferRef.current = new RingBuffer();
  const batcherRef = useRef<StreamBatcher | null>(null);
  if (!batcherRef.current) batcherRef.current = new StreamBatcher(bufferRef.current);
  const monitorRef = useRef<AdaptiveCapacityMonitor | null>(null);
  if (!monitorRef.current) monitorRef.current = new AdaptiveCapacityMonitor();

  const dimsRef = useRef(dimensions);
  dimsRef.current = dimensions;
  const rafRef = useRef(0);
  const lastFrameRef = useRef(0);

  // Throttle resize updates so a stream of ResizeObserver events can't thrash
  // React state during a burst.
  const handleResize = useMemo(
    () =>
      throttle((width: number, height: number) => {
        setDimensions({ width, height });
      }, 100),
    []
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const e of entries) {
        handleResize(
          Math.floor(e.contentRect.width),
          Math.floor(e.contentRect.height)
        );
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [handleResize]);

  // Simulated WebSocket ingestion → routed through the batcher.
  useEffect(() => {
    const batcher = batcherRef.current!;
    const interval = setInterval(() => {
      batcher.write(generatePoint());
    }, 100);
    return () => clearInterval(interval);
  }, []);

  // Draw loop: decoupled from ingestion, reads the ring buffer directly.
  useEffect(() => {
    const buffer = bufferRef.current!;
    const batcher = batcherRef.current!;
    const monitor = monitorRef.current!;

    const draw = (timestamp: number) => {
      // Frame-to-frame time drives the adaptive capacity (CPU monitor).
      const dt = lastFrameRef.current ? timestamp - lastFrameRef.current : 0;
      lastFrameRef.current = timestamp;
      if (dt > 0) buffer.setCapacity(monitor.record(dt));

      batcher.flushDue();

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const data = buffer.toArray();
      const { width, height } = dimsRef.current;

      ctx.clearRect(0, 0, width, height);
      ctx.fillStyle = "var(--background)";
      ctx.fillRect(0, 0, width, height);

      if (data.length >= 2) {
        ctx.strokeStyle = "#22c55e";
        ctx.lineWidth = 2;
        ctx.beginPath();
        const step = width / Math.max(data.length - 1, 1);
        for (let i = 0; i < data.length; i++) {
          const x = i * step;
          const y = height - (data[i] / 100) * height;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();

        const fillGradient = ctx.createLinearGradient(0, 0, 0, height);
        fillGradient.addColorStop(0, "rgba(34,197,94,0.2)");
        fillGradient.addColorStop(1, "rgba(34,197,94,0)");
        ctx.fillStyle = fillGradient;
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();
        ctx.fill();

        const avg = data.reduce((a, b) => a + b, 0) / data.length;
        ctx.fillStyle = "var(--foreground)";
        ctx.font = "12px monospace";
        ctx.fillText(`${avg.toFixed(1)}% avg`, 8, 16);
      }
    };

    const loop = (timestamp: number) => {
      draw(timestamp);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[200px] rounded-xl border border-border overflow-hidden"
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
