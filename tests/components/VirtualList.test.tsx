import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { VirtualList } from "@/components/ui/VirtualList";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    label: `Item ${i}`,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("VirtualList component", () => {
  beforeEach(() => {
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
    vi.restoreAllMocks();
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it("renders default empty state when items is empty", () => {
    render(
      <VirtualList
        items={[]}
        renderItem={() => <div>row</div>}
        ariaLabel="test-list"
      />
    );

    expect(screen.getByText("No items to display")).toBeDefined();
  });

  it("renders custom empty state when provided", () => {
    render(
      <VirtualList
        items={[]}
        renderItem={() => <div>row</div>}
        emptyState={<p>Nothing here</p>}
        ariaLabel="test-list"
      />
    );

    expect(screen.getByText("Nothing here")).toBeDefined();
  });

  // -----------------------------------------------------------------------
  // Rendering rows
  // -----------------------------------------------------------------------

  it("renders visible items with role='listitem'", () => {
    const items = makeItems(5);
    render(
      <VirtualList
        items={items}
        estimatedItemHeight={40}
        height={200}
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="meter-readings"
      />
    );

    // Should find at least some items rendered
    const listItems = screen.getAllByRole("listitem");
    expect(listItems.length).toBeGreaterThan(0);
  });

  it("applies aria-label to the container", () => {
    render(
      <VirtualList
        items={makeItems(3)}
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="reading-list"
      />
    );

    const list = screen.getByRole("list");
    expect(list.getAttribute("aria-label")).toBe("reading-list");
  });

  it("applies aria-rowcount to the container", () => {
    const items = makeItems(100);
    render(
      <VirtualList
        items={items}
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="big-list"
      />
    );

    const list = screen.getByRole("list");
    expect(list.getAttribute("aria-rowcount")).toBe("100");
  });

  // -----------------------------------------------------------------------
  // Loading indicator
  // -----------------------------------------------------------------------

  it("shows default loading indicator when isLoading", () => {
    render(
      <VirtualList
        items={makeItems(5)}
        isLoading={true}
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="loading-list"
      />
    );

    expect(screen.getByText("Loading more items…")).toBeDefined();
  });

  it("shows custom loading indicator when provided", () => {
    render(
      <VirtualList
        items={makeItems(5)}
        isLoading={true}
        loadingIndicator={<span>Fetching…</span>}
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="loading-list"
      />
    );

    expect(screen.getByText("Fetching…")).toBeDefined();
  });

  it("hides loading indicator when not loading", () => {
    render(
      <VirtualList
        items={makeItems(5)}
        isLoading={false}
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="idle-list"
      />
    );

    expect(screen.queryByText("Loading more items…")).toBeNull();
  });

  // -----------------------------------------------------------------------
  // Custom className
  // -----------------------------------------------------------------------

  it("forwards className to the container", () => {
    render(
      <VirtualList
        items={makeItems(3)}
        className="my-custom-list"
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="classed-list"
      />
    );

    const list = screen.getByRole("list");
    expect(list.className).toContain("my-custom-list");
  });

  // -----------------------------------------------------------------------
  // getItemKey
  // -----------------------------------------------------------------------

  it("uses getItemKey for stable React keys", () => {
    const items = makeItems(5);
    const getKey = vi.fn((item: (typeof items)[0]) => `key-${item.id}`);

    render(
      <VirtualList
        items={items}
        getItemKey={getKey}
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="keyed-list"
      />
    );

    // getItemKey should have been called for each rendered item
    expect(getKey).toHaveBeenCalled();
  });

  // -----------------------------------------------------------------------
  // Height prop
  // -----------------------------------------------------------------------

  it("accepts a number height and converts to px", () => {
    render(
      <VirtualList
        items={makeItems(3)}
        height={600}
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="height-list"
      />
    );

    const list = screen.getByRole("list");
    expect(list.style.height).toBe("600px");
  });

  it("accepts a string height (e.g., '100vh')", () => {
    render(
      <VirtualList
        items={makeItems(3)}
        height="80vh"
        renderItem={(item, _vi, measureRef) => (
          <div ref={measureRef}>{item.label}</div>
        )}
        ariaLabel="vh-list"
      />
    );

    const list = screen.getByRole("list");
    expect(list.style.height).toBe("80vh");
  });
});
