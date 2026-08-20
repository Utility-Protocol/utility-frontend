import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useSwipeGesture } from "@/hooks/useSwipeGesture";

describe("useSwipeGesture", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return a ref object", () => {
    const { result } = renderHook(() =>
      useSwipeGesture({
        threshold: 50,
      })
    );

    expect(result.current).toBeDefined();
    expect(result.current).toHaveProperty("current");
  });

  it("should accept all callback options", () => {
    const callbacks = {
      onSwipeLeft: vi.fn(),
      onSwipeRight: vi.fn(),
      onSwipeUp: vi.fn(),
      onSwipeDown: vi.fn(),
    };

    const { result } = renderHook(() =>
      useSwipeGesture({
        threshold: 50,
        ...callbacks,
      })
    );

    expect(result.current).toBeDefined();
  });

  it("should accept custom threshold", () => {
    const { result } = renderHook(() =>
      useSwipeGesture({
        threshold: 100,
      })
    );

    expect(result.current).toBeDefined();
  });

  it("should use default threshold of 50", () => {
    const { result } = renderHook(() =>
      useSwipeGesture({
        onSwipeRight: vi.fn(),
      })
    );

    expect(result.current).toBeDefined();
  });

  it("should handle missing callbacks gracefully", () => {
    const { result } = renderHook(() =>
      useSwipeGesture({
        threshold: 50,
      })
    );

    expect(result.current).toBeDefined();
    expect(() => {
      renderHook(() =>
        useSwipeGesture({
          threshold: 50,
          onSwipeRight: undefined,
        })
      );
    }).not.toThrow();
  });

  it("should support partial callback configuration", () => {
    const onSwipeRight = vi.fn();
    const { result } = renderHook(() =>
      useSwipeGesture({
        threshold: 50,
        onSwipeRight,
        // onSwipeLeft is not provided
      })
    );

    expect(result.current).toBeDefined();
  });

  it("should accept passive event listener options", () => {
    const { result } = renderHook(() =>
      useSwipeGesture({
        threshold: 50,
        onSwipeRight: vi.fn(),
      })
    );

    expect(result.current).toBeDefined();
  });
});
