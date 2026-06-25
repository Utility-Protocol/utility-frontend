"use client";

import { useEffect, useRef, useState, useCallback } from "react";

export interface ContainerSize {
  /** Container inline width in pixels */
  width: number;
  /** Container block height in pixels */
  height: number;
  /** Derived state label: compact | medium | expanded */
  containerState: "compact" | "medium" | "expanded";
}

interface UseContainerSizeOptions {
  /** Thresholds for state classification (px). Defaults to compact < 400 <= medium < 800 <= expanded */
  compactMax?: number;
  expandedMin?: number;
  /** Debounce delay in ms (default 100) */
  debounceMs?: number;
}

function classifyState(
  width: number,
  compactMax: number,
  expandedMin: number
): ContainerSize["containerState"] {
  if (width < compactMax) return "compact";
  if (width < expandedMin) return "medium";
  return "expanded";
}

/**
 * Track a container element's dimensions via ResizeObserver and derive a
 * container-state label (compact / medium / expanded) suitable for
 * imperative chart re-render triggers.
 *
 * Threshold defaults are read from CSS custom properties defined in
 * src/styles/breakpoints.css (e.g. --sidebar-compact-max). When no
 * CSS property is available, the fallback values are used.
 *
 * @param refOrSelector  A React ref to a DOM element, or a CSS selector string.
 * @param options        Thresholds and debounce configuration.
 */
export function useContainerSize(
  refOrSelector: React.RefObject<HTMLElement | null> | string,
  options: UseContainerSizeOptions = {}
): ContainerSize {
  const compactMax =
    options.compactMax ?? readCssPixelVar("--container-compact-max", 400);
  const expandedMin =
    options.expandedMin ?? readCssPixelVar("--container-expanded-min", 800);
  const debounceMs = options.debounceMs ?? 100;

  // Read CSS custom properties once on mount to avoid
  // forcing synchronous style recalculation on every render.
  const thresholdsRef = useRef({ compactMax, expandedMin });
  thresholdsRef.current = { compactMax, expandedMin };

  const [size, setSize] = useState<ContainerSize>({
    width: 0,
    height: 0,
    containerState: "compact",
  });

  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleResize = useCallback(
    (entry: ResizeObserverEntry) => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        const { width, height } = entry.contentRect;
        setSize({
          width: Math.floor(width),
          height: Math.floor(height),
          containerState: classifyState(width, thresholdsRef.current.compactMax, thresholdsRef.current.expandedMin),
        });
      }, debounceMs);
    },
    [compactMax, expandedMin, debounceMs]
  );

  useEffect(() => {
    let el: HTMLElement | null = null;

    if (typeof refOrSelector === "string") {
      el = document.querySelector<HTMLElement>(refOrSelector);
    } else {
      el = refOrSelector.current;
    }

    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        handleResize(entry);
      }
    });

    observer.observe(el);

    // Capture initial size
    const rect = el.getBoundingClientRect();
    setSize({
      width: Math.floor(rect.width),
      height: Math.floor(rect.height),
      containerState: classifyState(rect.width, thresholdsRef.current.compactMax, thresholdsRef.current.expandedMin),
    });

    return () => {
      observer.disconnect();
      clearTimeout(timerRef.current);
    };
  }, [refOrSelector, handleResize, compactMax, expandedMin]);

  return size;
}

/**
 * Read a CSS custom property from :root and parse it as pixels.
 * Falls back to `fallback` if the property is not set or unparseable.
 */
function readCssPixelVar(name: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (!raw) return fallback;
  const num = parseFloat(raw);
  return Number.isNaN(num) ? fallback : num;
}
