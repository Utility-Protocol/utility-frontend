import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { throttle, debounce } from "@/utils/helpers";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("throttle", () => {
  it("invokes immediately on the leading edge", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled("a");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("a");
  });

  it("suppresses calls within the window, then fires a trailing call", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled(1); // leading
    throttled(2); // suppressed
    throttled(3); // suppressed, becomes trailing args
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith(3); // latest args
  });

  it("allows another leading call after the window passes", () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 100);
    throttled("first");
    vi.advanceTimersByTime(150);
    throttled("second");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith("second");
  });
});

describe("debounce", () => {
  it("only fires after the quiet period", () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced("a");
    debounced("b");
    vi.advanceTimersByTime(99);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith("b");
  });
});
