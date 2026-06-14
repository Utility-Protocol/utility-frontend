"use client";

import { useRef, useEffect, useState, useCallback } from "react";

const MAX_POINTS = 200;
const BATCH_INTERVAL = 50;

function generatePoint(): number {
  return 40 + Math.random() * 60;
}

export function LiveDataView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 200 });
  const bufferRef = useRef<number[]>([]);
  const batchRef = useRef<number[]>([]);
  const rafRef = useRef(0);
  const lastFlush = useRef(Date.now());

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const e of entries) {
        setDimensions({
          width: Math.floor(e.contentRect.width),
          height: Math.floor(e.contentRect.height),
        });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const flushBatch = useCallback(() => {
    if (batchRef.current.length === 0) return;
    bufferRef.current = [
      ...bufferRef.current,
      ...batchRef.current,
    ].slice(-MAX_POINTS);
    batchRef.current = [];
  }, []);

  const pushPoint = useCallback((value: number) => {
    batchRef.current.push(value);
    const now = Date.now();
    if (now - lastFlush.current >= BATCH_INTERVAL) {
      flushBatch();
      lastFlush.current = now;
    }
  }, [flushBatch]);

  useEffect(() => {
    const interval = setInterval(() => {
      pushPoint(generatePoint());
    }, 100);
    return () => clearInterval(interval);
  }, [pushPoint]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const data = bufferRef.current;
    const { width, height } = dimensions;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "var(--background)";
    ctx.fillRect(0, 0, width, height);

    if (data.length < 2) return;

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
  }, [dimensions]);

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
