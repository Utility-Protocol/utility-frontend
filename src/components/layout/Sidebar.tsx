"use client";

import { useRef, type ReactNode } from "react";
import { useContainerSize } from "@/hooks/useContainerSize";

interface SidebarProps {
  /** Navigation items: { icon: JSX, label: string, href: string } */
  items?: { icon: ReactNode; label: string; href: string }[];
}

/**
 * CSS Container-query-driven Sidebar.
 *
 * All layout is driven by @container queries in containers.css.
 * The `useContainerSize` hook is only used for the optional dev
 * debug indicator — the component does NOT switch classes via JS.
 *
 * Container states (from containers.css):
 * - inline-size < 400px: icon-only, 64px wide
 * - 400px <= inline-size < 800px: compact labels, 220px wide
 * - inline-size >= 800px: full labels + padding, 320px wide
 */
export function Sidebar({ items = [] }: SidebarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { width, containerState } = useContainerSize(ref, {
    compactMax: 400,
    expandedMin: 800,
  });

  return (
    <aside
      ref={ref}
      className="container-sidebar border-r border-border bg-background shrink-0 sidebar-responsive"
      data-container-state={containerState}
      style={{ minWidth: 0 }}
    >
      {/* Navigation items — labels are hidden by CSS container queries in compact mode */}
      <nav className="flex flex-col gap-1 p-2">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-accent transition-colors text-sm font-medium text-foreground no-underline sidebar-item"
          >
            <span className="sidebar-icon shrink-0">{item.icon}</span>
            <span className="sidebar-label truncate">{item.label}</span>
          </a>
        ))}
      </nav>

      {/* Container size indicator (development aid only) */}
      {process.env.NODE_ENV === "development" && (
        <div className="mt-auto pt-4 border-t border-border px-2">
          <span className="text-xs text-muted-foreground">
            {width}px · {containerState}
          </span>
        </div>
      )}
    </aside>
  );
}
