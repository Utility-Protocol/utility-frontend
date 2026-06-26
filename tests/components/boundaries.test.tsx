import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import {
  DomainBoundary,
  DashboardBoundary,
  CascadeProvider,
  CascadeGate,
  useCascade,
} from "@/components/boundaries";
import { createResource, _clearInflight } from "@/utils/suspenseResource";
import { useSuspenseResource } from "@/hooks/useSuspenseResource";
import { cacheStore } from "@/store/slices/cacheSlice";
import type { SuspenseResource } from "@/types/suspense";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function Value({ resource }: { resource: SuspenseResource<{ label: string }> }) {
  const data = useSuspenseResource(resource);
  return <div>{data.label}</div>;
}

let counter = 0;
const key = (domain: string) => `${domain}:rtl${counter++}`;

beforeEach(() => {
  cacheStore.dispatch({ type: "RESET" });
  _clearInflight();
});

describe("DomainBoundary", () => {
  it("shows the fallback while suspended, then the content once resolved", async () => {
    const d = deferred<{ label: string }>();
    const resource = createResource(() => d.promise, {
      cacheKey: key("metadata"),
      ttlMs: 5000,
    });

    render(
      <DomainBoundary groups={["metadata"]} fallback={<div>skeleton</div>} errorTitle="err">
        <Value resource={resource} />
      </DomainBoundary>
    );

    expect(screen.getByText("skeleton")).toBeInTheDocument();

    await act(async () => {
      d.resolve({ label: "loaded!" });
      await d.promise;
    });

    await waitFor(() => expect(screen.getByText("loaded!")).toBeInTheDocument());
  });

  it("renders an ErrorPanel on failure and recovers on Retry", async () => {
    let attempt = 0;
    const resource = createResource(
      () => {
        attempt += 1;
        return attempt === 1
          ? Promise.reject(new Error("fail-once"))
          : Promise.resolve({ label: "recovered" });
      },
      { cacheKey: key("metadata"), ttlMs: 5000 }
    );

    render(
      <DomainBoundary groups={["metadata"]} fallback={<div>skeleton</div>} errorTitle="Metadata unavailable">
        <Value resource={resource} />
      </DomainBoundary>
    );

    await waitFor(() => expect(screen.getByText("Metadata unavailable")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("recovered")).toBeInTheDocument());
    expect(attempt).toBe(2);
  });
});

describe("DashboardBoundary fallback cascade", () => {
  it("surfaces a single dashboard error and the telemetry resource never fetches", async () => {
    const blockchain = createResource(() => Promise.reject(new Error("chain down")), {
      cacheKey: key("blockchain"),
      ttlMs: 5000,
    });
    const telemetry = createResource<{ label: string }>(
      () => Promise.resolve({ label: "tele" }),
      { cacheKey: key("telemetry"), ttlMs: 5000 }
    );

    render(
      <DashboardBoundary>
        <Value resource={blockchain} />
        <Value resource={telemetry} />
      </DashboardBoundary>
    );

    await waitFor(() =>
      expect(screen.getByText("Dashboard data unavailable")).toBeInTheDocument()
    );

    // The blockchain error cascaded to the single dashboard boundary: one error
    // panel is shown and the telemetry subtree is not rendered (no own loader).
    expect(screen.queryByText("tele")).not.toBeInTheDocument();
    expect(screen.queryByText("Telemetry stream unavailable")).not.toBeInTheDocument();
  });
});

describe("CascadeGate", () => {
  it("renders children until blocked, then the blocked view (skips the subtree)", () => {
    function Harness() {
      const { block } = useCascade();
      return (
        <>
          <button onClick={block}>block</button>
          <CascadeGate whenBlocked={<div>blocked-view</div>}>
            <div>active-view</div>
          </CascadeGate>
        </>
      );
    }

    render(
      <CascadeProvider>
        <Harness />
      </CascadeProvider>
    );

    expect(screen.getByText("active-view")).toBeInTheDocument();
    expect(screen.queryByText("blocked-view")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "block" }));

    expect(screen.getByText("blocked-view")).toBeInTheDocument();
    expect(screen.queryByText("active-view")).not.toBeInTheDocument();
  });
});
