"use client";

import { useCallback, useRef, type ReactNode } from "react";
import {
  useVirtualList,
  type UseVirtualListOptions,
  type VirtualItem,
} from "@/hooks/useVirtualList";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VirtualListProps<T> {
  /** Full dataset to be rendered virtually. */
  items: T[];
  /**
   * Render callback for each visible item. Receives the data item, its
   * virtual-layout metadata, and a `measureRef` callback that *must* be
   * attached to the outermost DOM element of the row so the list can
   * measure its real height.
   */
  renderItem: (
    item: T,
    virtualItem: VirtualItem,
    measureRef: (el: HTMLElement | null) => void
  ) => ReactNode;
  /**
   * Derive a stable React key for each item.
   * Falls back to the item's array index if omitted.
   */
  getItemKey?: (item: T, index: number) => string | number;
  /** Height of the scrollable container (px or CSS value). */
  height?: number | string;
  /** Optional extra className on the outer container. */
  className?: string;
  /**
   * Estimated average row height (px). A closer estimate improves initial
   * scroll-bar accuracy.
   * @default 48
   */
  estimatedItemHeight?: number;
  /**
   * Extra rows rendered above/below the viewport.
   * @default 5
   */
  overscan?: number;
  /**
   * Session-storage key for scroll-position restoration.
   * Omit to disable.
   */
  scrollRestorationKey?: string;
  /** Async callback invoked near the bottom of the list. */
  onLoadMore?: () => Promise<void> | void;
  /**
   * Distance (px) from the bottom at which `onLoadMore` fires.
   * @default 200
   */
  loadMoreThreshold?: number;
  /** Whether a load-more request is in flight. */
  isLoading?: boolean;
  /** Rendered at the very bottom while `isLoading` is true. */
  loadingIndicator?: ReactNode;
  /** Rendered when `items` is empty and not loading. */
  emptyState?: ReactNode;
  /** Accessible label for the list container. */
  ariaLabel?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VirtualList<T>({
  items,
  renderItem,
  getItemKey,
  height = 400,
  className,
  estimatedItemHeight,
  overscan,
  scrollRestorationKey,
  onLoadMore,
  loadMoreThreshold,
  isLoading = false,
  loadingIndicator,
  emptyState,
  ariaLabel,
}: VirtualListProps<T>) {
  const hookOptions: UseVirtualListOptions<T> = {
    items,
    estimatedItemHeight,
    overscan,
    scrollRestorationKey,
    onLoadMore,
    loadMoreThreshold,
    isLoading,
    getItemKey,
  };

  const {
    containerRef,
    innerRef,
    virtualItems,
    totalHeight,
    measureElement,
  } = useVirtualList(hookOptions);

  // Factory that produces a stable `measureRef` per row index.
  const measureRefs = useRef<Record<number, (el: HTMLElement | null) => void>>({});
  const createMeasureRef = useCallback(
    (index: number) => {
      if (!measureRefs.current[index]) {
        measureRefs.current[index] = (el: HTMLElement | null) => {
          measureElement(index, el);
        };
      }
      return measureRefs.current[index];
    },
    [measureElement]
  );

  const resolvedHeight =
    typeof height === "number" ? `${height}px` : height;

  // Empty state
  if (items.length === 0 && !isLoading) {
    return (
      <div
        className={`virtual-list-container ${className ?? ""}`}
        style={{ height: resolvedHeight, overflow: "auto" }}
        role="list"
        aria-label={ariaLabel}
      >
        {emptyState ?? (
          <div className="virtual-list-empty">No items to display</div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`virtual-list-container ${className ?? ""}`}
      style={{
        height: resolvedHeight,
        overflow: "auto",
        position: "relative",
      }}
      role="list"
      aria-label={ariaLabel}
      aria-rowcount={items.length}
    >
      <div
        ref={innerRef}
        className="virtual-list-inner"
        style={{
          height: `${totalHeight}px`,
          position: "relative",
          width: "100%",
        }}
      >
        {virtualItems.map((vi) => {
          const key = getItemKey
            ? getItemKey(items[vi.index], vi.index)
            : vi.index;

          return (
            <div
              key={key}
              className="virtual-list-row"
              role="listitem"
              aria-rowindex={vi.index + 1}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${vi.offsetTop}px)`,
                willChange: "transform",
              }}
            >
              {renderItem(items[vi.index], vi, createMeasureRef(vi.index))}
            </div>
          );
        })}
      </div>

      {isLoading && (
        <div className="virtual-list-loading" role="status" aria-live="polite">
          {loadingIndicator ?? (
            <div className="virtual-list-loading-default">
              <span className="virtual-list-spinner" aria-hidden="true" />
              Loading more items…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default VirtualList;
