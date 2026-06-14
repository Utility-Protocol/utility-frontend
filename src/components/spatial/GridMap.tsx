"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useTheme } from "@/components/providers/ThemeProvider";

interface GridNode {
  id: string;
  x: number;
  y: number;
  resource: number;
  status: "active" | "idle" | "fault";
}

function generateNodes(count: number, width: number, height: number): GridNode[] {
  const nodes: GridNode[] = [];
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const cellW = width / cols;
  const cellH = height / rows;
  for (let i = 0; i < count; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    nodes.push({
      id: `node-${i}`,
      x: col * cellW + cellW / 2 + (Math.random() - 0.5) * cellW * 0.4,
      y: row * cellH + cellH / 2 + (Math.random() - 0.5) * cellH * 0.4,
      resource: 0.2 + Math.random() * 0.8,
      status: Math.random() > 0.15 ? "active" : Math.random() > 0.5 ? "idle" : "fault",
    });
  }
  return nodes;
}

const NODE_RADIUS = 6;
const NODE_COUNT = 500;

export function GridMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { mode } = useTheme();
  const [dimensions, setDimensions] = useState({ width: 800, height: 500 });
  const nodesRef = useRef<GridNode[]>([]);
  const animFrame = useRef<number>(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    nodesRef.current = generateNodes(NODE_COUNT, dimensions.width, dimensions.height);
  }, [dimensions.width, dimensions.height]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const isDark = mode === "dark" || mode === "high-contrast";
    const bg = isDark ? "#0a0a0a" : "#ffffff";
    const activeColor = isDark ? "#22c55e" : "#16a34a";
    const idleColor = isDark ? "#a3a3a3" : "#737373";
    const faultColor = "#ef4444";
    const gridColor = isDark ? "#1a1a1a" : "#f0f0f0";

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, dimensions.width, dimensions.height);

    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    const spacing = 40;
    for (let x = 0; x < dimensions.width; x += spacing) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, dimensions.height);
      ctx.stroke();
    }
    for (let y = 0; y < dimensions.height; y += spacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(dimensions.width, y);
      ctx.stroke();
    }

    const nodes = nodesRef.current;
    for (const node of nodes) {
      ctx.beginPath();
      ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
      const color =
        node.status === "active"
          ? activeColor
          : node.status === "idle"
          ? idleColor
          : faultColor;
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.3 + node.resource * 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }, [dimensions, mode]);

  useEffect(() => {
    animFrame.current = requestAnimationFrame(function loop() {
      draw();
      animFrame.current = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(animFrame.current);
  }, [draw]);

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[500px] rounded-xl border border-border overflow-hidden"
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
