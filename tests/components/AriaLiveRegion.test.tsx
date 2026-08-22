import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAriaLiveAnnouncer } from "@/components/common/AriaLiveRegion";

describe("useAriaLiveAnnouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it("keeps polite and assertive announcements independent", () => {
    const { result } = renderHook(() => useAriaLiveAnnouncer());

    act(() => {
      result.current.announce("Email needs attention.");
      result.current.announceError("Form could not be submitted.");
    });

    expect(result.current.politeMessage).toBe("Email needs attention.");
    expect(result.current.assertiveMessage).toBe(
      "Error: Form could not be submitted."
    );

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(result.current.politeMessage).toBe("");
    expect(result.current.assertiveMessage).toBe("");
  });

  it("restarts only the timer for the announcement priority being updated", () => {
    const { result } = renderHook(() => useAriaLiveAnnouncer());

    act(() => {
      result.current.announce("First field error.");
      vi.advanceTimersByTime(50);
      result.current.announce("Updated field error.");
      result.current.announceError("Submit failed.");
    });

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.politeMessage).toBe("Updated field error.");
    expect(result.current.assertiveMessage).toBe("Error: Submit failed.");

    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.politeMessage).toBe("");
    expect(result.current.assertiveMessage).toBe("");
  });

  it("cleans both pending timers up on unmount", () => {
    const { result, unmount } = renderHook(() => useAriaLiveAnnouncer());

    act(() => {
      result.current.announce("Polite update.");
      result.current.announceError("Assertive update.");
    });
    expect(vi.getTimerCount()).toBe(2);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});
