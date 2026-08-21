import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVirtualList } from "@/hooks/useVirtualList";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate N simple items. */
function makeItems(count: number): Array<{ id: number; label: string }> {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("useVirtualList", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    // Mock requestAnimationFrame to execute callback immediately
    vi.stubGlobal(
      "requestAnimationFrame",
      (cb: FrameRequestCallback) => {
        cb(performance.now());
        return 1;
      }
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  // -----------------------------------------------------------------------
  // Basic rendering
  // -----------------------------------------------------------------------

  it("returns empty virtualItems for an empty dataset", () => {
    const { result } = renderHook(() =>
      useVirtualList({ items: [], estimatedItemHeight: 40 })
    );
    expect(result.current.virtualItems).toEqual([]);
    expect(result.current.totalHeight).toBe(0);
    expect(result.current.visibleItems).toEqual([]);
  });

  it("computes totalHeight from estimatedItemHeight × item count", () => {
    const items = makeItems(100);
    const { result } = renderHook(() =>
      useVirtualList({ items, estimatedItemHeight: 50 })
    );
    expect(result.current.totalHeight).toBe(100 * 50);
  });

  it("uses default estimatedItemHeight of 48 when unspecified", () => {
    const items = makeItems(10);
    const { result } = renderHook(() => useVirtualList({ items }));
    expect(result.current.totalHeight).toBe(10 * 48);
  });

  // -----------------------------------------------------------------------
  // Large dataset support
  // -----------------------------------------------------------------------

  it("handles 10,000+ items without error", () => {
    const items = makeItems(15_000);
    const { result } = renderHook(() =>
      useVirtualList({ items, estimatedItemHeight: 40 })
    );
    expect(result.current.totalHeight).toBe(15_000 * 40);
    // Only a small window should be in virtualItems (not all 15k)
    expect(result.current.virtualItems.length).toBeLessThan(100);
  });

  it("handles 50,000 items efficiently", () => {
    const items = makeItems(50_000);
    const start = performance.now();
    const { result } = renderHook(() =>
      useVirtualList({ items, estimatedItemHeight: 40 })
    );
    const elapsed = performance.now() - start;

    expect(result.current.totalHeight).toBe(50_000 * 40);
    // Should initialise in under 500ms even with 50k items
    expect(elapsed).toBeLessThan(500);
  });

  // -----------------------------------------------------------------------
  // Dynamic row height measurement
  // -----------------------------------------------------------------------

  it("updates totalHeight after measuring a row", () => {
    const items = makeItems(10);
    const { result } = renderHook(() =>
      useVirtualList({ items, estimatedItemHeight: 40 })
    );

    expect(result.current.totalHeight).toBe(400); // 10 × 40

    // Simulate measuring index 0 as 80px tall (double the estimate)
    const el = document.createElement("div");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      height: 80,
      width: 200,
      x: 0,
      y: 0,
      top: 0,
      right: 200,
      bottom: 80,
      left: 0,
      toJSON: () => ({}),
    });

    act(() => {
      result.current.measureElement(0, el);
    });

    // Total should now be 80 + 9×40 = 440
    expect(result.current.totalHeight).toBe(440);
  });

  it("does not re-render when measured height is unchanged", () => {
    const items = makeItems(5);
    const { result } = renderHook(() =>
      useVirtualList({ items, estimatedItemHeight: 40 })
    );

    const el = document.createElement("div");
    vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
      height: 40,
      width: 200,
      x: 0,
      y: 0,
      top: 0,
      right: 200,
      bottom: 40,
      left: 0,
      toJSON: () => ({}),
    });

    const totalBefore = result.current.totalHeight;

    act(() => {
      result.current.measureElement(0, el);
    });

    // Height matches the estimate — totalHeight should be unchanged.
    expect(result.current.totalHeight).toBe(totalBefore);
  });

  // -----------------------------------------------------------------------
  // measureElement null safety
  // -----------------------------------------------------------------------

  it("safely ignores null elements passed to measureElement", () => {
    const items = makeItems(5);
    const { result } = renderHook(() => useVirtualList({ items }));

    // Should not throw
    act(() => {
      result.current.measureElement(0, null);
    });

    expect(result.current.totalHeight).toBe(5 * 48);
  });

  // -----------------------------------------------------------------------
  // Scroll position restoration
  // -----------------------------------------------------------------------

  it("stores scroll position in sessionStorage", () => {
    const items = makeItems(100);
    const key = "test-scroll";

    renderHook(() =>
      useVirtualList({
        items,
        estimatedItemHeight: 40,
        scrollRestorationKey: key,
      })
    );

    // The key should have been accessed
    const stored = sessionStorage.getItem(`vlist-scroll-${key}`);
    // It may be "0" on initial render
    expect(stored).not.toBeNull();
  });

  // -----------------------------------------------------------------------
  // Loading state
  // -----------------------------------------------------------------------

  it("exposes isLoading from options", () => {
    const items = makeItems(10);
    const { result, rerender } = renderHook(
      ({ loading }: { loading: boolean }) =>
        useVirtualList({ items, isLoading: loading }),
      { initialProps: { loading: false } }
    );

    expect(result.current.isLoading).toBe(false);

    rerender({ loading: true });
    expect(result.current.isLoading).toBe(true);
  });

  // -----------------------------------------------------------------------
  // scrollToIndex
  // -----------------------------------------------------------------------

  it("provides a scrollToIndex function", () => {
    const items = makeItems(100);
    const { result } = renderHook(() =>
      useVirtualList({ items, estimatedItemHeight: 40 })
    );

    // scrollToIndex should be a callable function
    expect(typeof result.current.scrollToIndex).toBe("function");
  });

  // -----------------------------------------------------------------------
  // Refs
  // -----------------------------------------------------------------------

  it("provides containerRef and innerRef", () => {
    const items = makeItems(10);
    const { result } = renderHook(() => useVirtualList({ items }));

    expect(result.current.containerRef).toBeDefined();
    expect(result.current.innerRef).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Virtual items structure
  // -----------------------------------------------------------------------

  it("virtual items contain correct index and offsetTop", () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useVirtualList({ items, estimatedItemHeight: 50 })
    );

    for (const vi of result.current.virtualItems) {
      expect(vi.index).toBeGreaterThanOrEqual(0);
      expect(vi.index).toBeLessThan(20);
      expect(vi.offsetTop).toBe(vi.index * 50);
      expect(vi.height).toBe(50);
    }
  });

  it("visibleItems maps correctly to virtualItems indices", () => {
    const items = makeItems(20);
    const { result } = renderHook(() =>
      useVirtualList({ items, estimatedItemHeight: 50 })
    );

    const { virtualItems, visibleItems } = result.current;
    expect(visibleItems.length).toBe(virtualItems.length);

    visibleItems.forEach((item, i) => {
      expect(item).toBe(items[virtualItems[i].index]);
    });
  });

  // -----------------------------------------------------------------------
  // Reactivity to items change
  // -----------------------------------------------------------------------

  it("updates when items array grows", () => {
    let data = makeItems(10);
    const { result, rerender } = renderHook(() =>
      useVirtualList({ items: data, estimatedItemHeight: 40 })
    );

    expect(result.current.totalHeight).toBe(400);

    data = makeItems(20);
    rerender();

    expect(result.current.totalHeight).toBe(800);
  });
});
