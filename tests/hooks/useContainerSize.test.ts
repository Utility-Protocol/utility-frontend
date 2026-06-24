import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useContainerSize } from "@/hooks/useContainerSize";

/**
 * Constructor-compatible ResizeObserver mock.
 * Stores the callback and lets tests fire entries on demand.
 */
let observerCallback: ResizeObserverCallback | null = null;

class MockResizeObserver {
  constructor(callback: ResizeObserverCallback) {
    observerCallback = callback;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

// ----------------------------------------------------------------

describe("useContainerSize", () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    observerCallback = null;

    container = document.createElement("div");
    container.style.width = "600px";
    container.style.height = "400px";
    document.body.appendChild(container);

    // Mock getBoundingClientRect for the initial size capture
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 600,
      height: 400,
      x: 0,
      y: 0,
      top: 0,
      right: 600,
      bottom: 400,
      left: 0,
      toJSON: () => ({}),
    });
  });

  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  // ------------------------------------------------------------------
  // Initial state
  // ------------------------------------------------------------------

  it("returns initial dimensions from getBoundingClientRect", () => {
    const ref = { current: container };
    const { result } = renderHook(() => useContainerSize(ref));

    // Initial render happens before ResizeObserver fires, so
    // we get the value from getBoundingClientRect
    expect(result.current.width).toBe(600);
    expect(result.current.height).toBe(400);
    expect(result.current.containerState).toBe("medium"); // 400 <= 600 < 800
  });

  it("classifies as compact when width < compactMax", () => {
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 200,
      height: 400,
      x: 0,
      y: 0,
      top: 0,
      right: 200,
      bottom: 400,
      left: 0,
      toJSON: () => ({}),
    });

    const ref = { current: container };
    const { result } = renderHook(() => useContainerSize(ref));

    expect(result.current.containerState).toBe("compact");
  });

  it("classifies as expanded when width >= expandedMin", () => {
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 1000,
      height: 600,
      x: 0,
      y: 0,
      top: 0,
      right: 1000,
      bottom: 600,
      left: 0,
      toJSON: () => ({}),
    });

    const ref = { current: container };
    const { result } = renderHook(() => useContainerSize(ref));

    expect(result.current.containerState).toBe("expanded");
  });

  // ------------------------------------------------------------------
  // ResizeObserver callback
  // ------------------------------------------------------------------

  it("updates size on ResizeObserver callback (debounced)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const ref = { current: container };
    const { result, rerender } = renderHook(() => useContainerSize(ref));

    // Simulate a resize event
    expect(observerCallback).not.toBeNull();
    const entry = {
      contentRect: { width: 350, height: 300 },
    } as ResizeObserverEntry;

    observerCallback!([entry], {} as ResizeObserver);

    // Advance past the debounce window + React re-render
    vi.advanceTimersByTime(200);
    rerender();

    expect(result.current.width).toBe(350);
    expect(result.current.height).toBe(300);
    expect(result.current.containerState).toBe("compact"); // 350 < 400
    vi.useRealTimers();
  });

  // ------------------------------------------------------------------
  // Custom thresholds
  // ------------------------------------------------------------------

  it("respects custom compactMax and expandedMin", () => {
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 500,
      height: 400,
      x: 0,
      y: 0,
      top: 0,
      right: 500,
      bottom: 400,
      left: 0,
      toJSON: () => ({}),
    });

    const ref = { current: container };
    const { result } = renderHook(() =>
      useContainerSize(ref, { compactMax: 200, expandedMin: 600 })
    );

    // 500 is >= 200 and < 600 → medium
    expect(result.current.containerState).toBe("medium");
  });

  // ------------------------------------------------------------------
  // Selector-based ref
  // ------------------------------------------------------------------

  it("works with a CSS selector string", () => {
    container.id = "test-container";
    vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
      width: 900,
      height: 500,
      x: 0,
      y: 0,
      top: 0,
      right: 900,
      bottom: 500,
      left: 0,
      toJSON: () => ({}),
    });

    const { result } = renderHook(() => useContainerSize("#test-container"));

    expect(result.current.width).toBe(900);
    expect(result.current.containerState).toBe("expanded");
  });
});
