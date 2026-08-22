"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VirtualItem {
  /** Index in the source data array. */
  index: number;
  /** Offset from the top of the scrollable content (px). */
  offsetTop: number;
  /** Measured or estimated height (px). */
  height: number;
}

export interface UseVirtualListOptions<T> {
  /** Full dataset — the hook only renders a visible window. */
  items: T[];
  /**
   * Estimated average row height (px). Used for initial layout before
   * measurements are available. A closer estimate reduces layout jumps.
   * @default 48
   */
  estimatedItemHeight?: number;
  /**
   * Extra items rendered above/below the visible window to reduce flicker
   * during fast scrolling.
   * @default 5
   */
  overscan?: number;
  /**
   * Session-storage key to persist scroll position across unmounts.
   * Omit to disable scroll restoration.
   */
  scrollRestorationKey?: string;
  /**
   * Called when the user scrolls within `loadMoreThreshold` of the bottom.
   * Return a Promise that resolves when the next page is ready.
   */
  onLoadMore?: () => Promise<void> | void;
  /**
   * Distance from the bottom (px) at which `onLoadMore` triggers.
   * @default 200
   */
  loadMoreThreshold?: number;
  /** If true, indicates that more data is currently being fetched. */
  isLoading?: boolean;
  /**
   * If true the container element is expected to be an `overflow: auto`
   * scrollable. Otherwise the hook attaches to `window` scroll events.
   * @default true
   */
  useContainerScroll?: boolean;
  /**
   * Optional function to derive a unique key for each item.
   * Falls back to the array index if omitted.
   */
  getItemKey?: (item: T, index: number) => string | number;
}

export interface UseVirtualListReturn<T> {
  /** Ref to attach to the scrollable container element. */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Ref to attach to the inner "spacer" element that defines total height. */
  innerRef: React.RefObject<HTMLDivElement | null>;
  /** The visible slice of virtual items to render. */
  virtualItems: VirtualItem[];
  /** Total estimated content height (px). */
  totalHeight: number;
  /** Whether new data is currently loading. */
  isLoading: boolean;
  /** Register a measured DOM element for a given data index. */
  measureElement: (index: number, element: HTMLElement | null) => void;
  /** Programmatically scroll to a specific item index. */
  scrollToIndex: (index: number, behavior?: ScrollBehavior) => void;
  /** The original items slice corresponding to `virtualItems`. */
  visibleItems: T[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_ESTIMATED_HEIGHT = 48;
const DEFAULT_OVERSCAN = 5;
const DEFAULT_LOAD_MORE_THRESHOLD = 200;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Binary-search for the first item whose cumulative bottom edge is at or
 * below `scrollTop`.
 */
function findStartIndex(
  offsets: number[],
  heights: number[],
  scrollTop: number
): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const bottom = offsets[mid] + heights[mid];
    if (bottom <= scrollTop) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useVirtualList<T>(
  options: UseVirtualListOptions<T>
): UseVirtualListReturn<T> {
  const {
    items,
    estimatedItemHeight = DEFAULT_ESTIMATED_HEIGHT,
    overscan = DEFAULT_OVERSCAN,
    scrollRestorationKey,
    onLoadMore,
    loadMoreThreshold = DEFAULT_LOAD_MORE_THRESHOLD,
    isLoading = false,
    useContainerScroll = true,
  } = options;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const innerRef = useRef<HTMLDivElement | null>(null);

  // Per-index measured heights; `undefined` means "not yet measured".
  const measuredHeights = useRef<Map<number, number>>(new Map());

  // Track whether we're already loading to prevent duplicate triggers.
  const loadingRef = useRef(false);
  loadingRef.current = isLoading;

  // Debounce RAF handle.
  const rafRef = useRef<number | null>(null);

  // A simple counter that forces re-computation when measurements change.
  const [measureVersion, setMeasureVersion] = useState(0);

  // -----------------------------------------------------------------------
  // Derived: offsets + heights arrays
  // -----------------------------------------------------------------------

  const { offsets, heights, totalHeight } = useMemo(() => {
    const count = items.length;
    const _offsets = new Array<number>(count);
    const _heights = new Array<number>(count);

    let cumulative = 0;
    for (let i = 0; i < count; i++) {
      _offsets[i] = cumulative;
      _heights[i] = measuredHeights.current.get(i) ?? estimatedItemHeight;
      cumulative += _heights[i];
    }

    return { offsets: _offsets, heights: _heights, totalHeight: cumulative };
    // measureVersion dependency triggers recomputation after DOM measurement.
  }, [items.length, estimatedItemHeight, measureVersion]);

  // -----------------------------------------------------------------------
  // Scroll state
  // -----------------------------------------------------------------------

  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Store totalHeight in a ref so the scroll handler always reads the latest.
  const totalHeightRef = useRef(totalHeight);
  totalHeightRef.current = totalHeight;

  const handleScroll = useCallback(() => {
    if (rafRef.current !== null) return; // coalesce to one per frame
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const el = containerRef.current;
      if (!el) return;

      const top = useContainerScroll ? el.scrollTop : window.scrollY;
      const height = useContainerScroll ? el.clientHeight : window.innerHeight;

      setScrollTop(top);
      setContainerHeight(height);

      // Persist scroll position for restoration.
      if (scrollRestorationKey) {
        try {
          sessionStorage.setItem(
            `vlist-scroll-${scrollRestorationKey}`,
            String(top)
          );
        } catch {
          /* quota exceeded — non-critical */
        }
      }

      // Infinite-scroll trigger.
      if (
        onLoadMore &&
        !loadingRef.current &&
        totalHeightRef.current - (top + height) < loadMoreThreshold
      ) {
        loadingRef.current = true;
        onLoadMore();
      }
    });
  }, [useContainerScroll, scrollRestorationKey, onLoadMore, loadMoreThreshold]);

  // Attach / detach scroll listener.
  useEffect(() => {
    const target = useContainerScroll ? containerRef.current : window;
    if (!target) return;

    target.addEventListener("scroll", handleScroll as EventListener, {
      passive: true,
    });

    // Capture initial measurements.
    handleScroll();

    return () => {
      target.removeEventListener("scroll", handleScroll as EventListener);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [handleScroll, useContainerScroll]);

  // -----------------------------------------------------------------------
  // Scroll position restoration
  // -----------------------------------------------------------------------

  useLayoutEffect(() => {
    if (!scrollRestorationKey) return;
    try {
      const saved = sessionStorage.getItem(
        `vlist-scroll-${scrollRestorationKey}`
      );
      if (saved !== null) {
        const pos = Number(saved);
        if (!Number.isNaN(pos) && containerRef.current) {
          containerRef.current.scrollTop = pos;
        }
      }
    } catch {
      /* ignore */
    }
  }, [scrollRestorationKey]);

  // -----------------------------------------------------------------------
  // Visible window calculation
  // -----------------------------------------------------------------------

  const virtualItems = useMemo<VirtualItem[]>(() => {
    if (items.length === 0 || offsets.length === 0) return [];

    const start = Math.max(
      0,
      findStartIndex(offsets, heights, scrollTop) - overscan
    );
    const visibleEnd = scrollTop + containerHeight;
    let end = start;
    while (end < items.length && offsets[end] < visibleEnd) {
      end++;
    }
    end = Math.min(items.length - 1, end + overscan);

    const result: VirtualItem[] = [];
    for (let i = start; i <= end; i++) {
      result.push({
        index: i,
        offsetTop: offsets[i],
        height: heights[i],
      });
    }
    return result;
  }, [items.length, offsets, heights, scrollTop, containerHeight, overscan]);

  const visibleItems = useMemo(
    () => virtualItems.map((vi) => items[vi.index]),
    [virtualItems, items]
  );

  // -----------------------------------------------------------------------
  // Dynamic measurement
  // -----------------------------------------------------------------------

  const measureElement = useCallback(
    (index: number, element: HTMLElement | null) => {
      if (!element) return;
      const measured = element.getBoundingClientRect().height;
      const prev = measuredHeights.current.get(index);
      if (prev !== measured) {
        measuredHeights.current.set(index, measured);
        setMeasureVersion((v) => v + 1);
      }
    },
    []
  );

  // -----------------------------------------------------------------------
  // Programmatic scroll
  // -----------------------------------------------------------------------

  const scrollToIndex = useCallback(
    (index: number, behavior: ScrollBehavior = "auto") => {
      const clamped = Math.max(0, Math.min(index, items.length - 1));
      const targetOffset = offsets[clamped] ?? 0;
      if (useContainerScroll && containerRef.current) {
        containerRef.current.scrollTo({ top: targetOffset, behavior });
      } else {
        window.scrollTo({ top: targetOffset, behavior });
      }
    },
    [items.length, offsets, useContainerScroll]
  );

  // -----------------------------------------------------------------------
  // Clean up on unmount
  // -----------------------------------------------------------------------

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return {
    containerRef,
    innerRef,
    virtualItems,
    totalHeight,
    isLoading,
    measureElement,
    scrollToIndex,
    visibleItems,
  };
}
