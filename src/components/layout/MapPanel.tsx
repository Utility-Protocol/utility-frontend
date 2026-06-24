"use client";

import { type ReactNode } from "react";

interface MapPanelProps {
  children?: ReactNode;
  /** Toolbar controls rendered inside the map panel header */
  controls?: ReactNode;
}

/**
 * CSS Container-query-driven Map Panel.
 *
 * All layout is driven by @container queries in containers.css.
 * No JS-based class switching — the CSS handles vertical vs horizontal
 * control layout based on the container's inline size.
 */
export function MapPanel({ children, controls }: MapPanelProps) {
  return (
    <div className="container-map-panel rounded-xl border border-border bg-background overflow-hidden">
      {/* Controls toolbar — CSS container queries switch direction */}
      {controls && (
        <div className="map-controls flex items-center p-2 gap-2 border-b border-border">
          {controls}
        </div>
      )}

      {/* Main content area */}
      <div className="w-full" style={{ minHeight: 300 }}>
        {children}
      </div>
    </div>
  );
}
