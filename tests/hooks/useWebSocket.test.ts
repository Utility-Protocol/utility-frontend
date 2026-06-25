import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWebSocket } from "@/hooks/useWebSocket";
import { connectionStore } from "@/store/slices/connectionSlice";
import type { SocketLike } from "@/hooks/useTelemetryStream";
import type { TelemetryFrame } from "@/types/connection";

class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];
  binaryType = "arraybuffer";
  readyState = 0;
  sent: string[] = [];
  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  constructor(public url: string) {
    FakeSocket.instances.push(this);
  }
  send(data: string | ArrayBuffer): void {
    this.sent.push(typeof data === "string" ? data : "<binary>");
  }
  close(): void {
    this.readyState = 3;
    this.onclose?.(new CloseEvent("close"));
  }
  fireOpen(): void {
    this.readyState = 1;
    this.onopen?.(new Event("open"));
  }
  fireMessage(payload: unknown): void {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    this.onmessage?.({ data } as MessageEvent);
  }
  lastSent(): unknown {
    const raw = this.sent[this.sent.length - 1];
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
}

function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

const baseOptions = () => ({
  url: "wss://api.test/ws",
  createSocket: (url: string) => new FakeSocket(url),
  rng: () => 0.5,
  now: () => 1000,
  storage: makeStorage(),
});

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.instances = [];
  connectionStore.dispatch({ type: "RESET" });
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("useWebSocket", () => {
  it("connects, opens, and reaches connected", () => {
    const { result } = renderHook(() => useWebSocket(baseOptions()));
    expect(FakeSocket.instances).toHaveLength(1);

    act(() => FakeSocket.instances[0].fireOpen());
    expect(result.current.status).toBe("connected");
    expect(connectionStore.getState().status).toBe("connected");
  });

  it("answers server pings with a pong", () => {
    renderHook(() => useWebSocket(baseOptions()));
    const sock = FakeSocket.instances[0];
    act(() => sock.fireOpen());
    act(() => sock.fireMessage({ type: "ping" }));
    expect(sock.lastSent()).toEqual({ type: "pong" });
  });

  it("persists the assigned sticky node id and uses it on reconnect", () => {
    const opts = baseOptions();
    renderHook(() => useWebSocket(opts));
    const sock = FakeSocket.instances[0];
    act(() => sock.fireOpen());
    act(() => sock.fireMessage({ type: "node_assigned", nodeId: "node-42" }));

    expect(opts.storage._map.get("ws:stickyNodeId")).toBe("node-42");

    // Drop the connection and let the backoff timer fire.
    act(() => sock.close());
    act(() => vi.advanceTimersByTime(1000));
    const reconnected = FakeSocket.instances[1];
    expect(reconnected.url).toContain("nodeId=node-42");
  });

  it("buffers telemetry frames and forwards them to onFrame", () => {
    const frames: TelemetryFrame[] = [];
    const opts = { ...baseOptions(), onFrame: (f: TelemetryFrame) => frames.push(f) };
    renderHook(() => useWebSocket(opts));
    const sock = FakeSocket.instances[0];
    act(() => sock.fireOpen());
    act(() => sock.fireMessage({ sequenceId: 1, data: { x: 1 }, receivedAt: 1, size: 50 }));
    act(() => sock.fireMessage({ sequenceId: 2, data: { x: 2 }, receivedAt: 2, size: 50 }));
    expect(frames.map((f) => f.sequenceId)).toEqual([1, 2]);
  });

  it("schedules a jittered reconnect, runs recovery, and backfills missed frames", async () => {
    const replayFetch = vi
      .fn<(from: number, to: number) => Promise<TelemetryFrame[]>>()
      .mockResolvedValue([
        { sequenceId: 6, data: {}, receivedAt: 6, size: 10 },
      ]);
    const backfilled: number[] = [];
    const opts = {
      ...baseOptions(),
      replayFetch,
      onFrame: (f: TelemetryFrame) => backfilled.push(f.sequenceId),
    };
    const { result } = renderHook(() => useWebSocket(opts));

    const sock = FakeSocket.instances[0];
    act(() => sock.fireOpen());
    act(() => sock.fireMessage({ sequenceId: 5, data: {}, receivedAt: 5, size: 10 }));

    // Server drops us.
    act(() => sock.close());
    expect(result.current.status).toBe("reconnecting");
    expect(result.current.attempt).toBe(1);

    // ceiling(0)=500, rng 0.5 → 250 ms backoff.
    act(() => vi.advanceTimersByTime(250));
    expect(FakeSocket.instances).toHaveLength(2);

    const sock2 = FakeSocket.instances[1];
    act(() => sock2.fireOpen());
    // Reconnect enters recovery and replays the buffered frame.
    expect(result.current.status).toBe("recovering");
    const recovery = sock2.lastSent() as { type: string; lastSequenceId: number };
    expect(recovery.type).toBe("recovery");
    expect(recovery.lastSequenceId).toBe(5);

    await act(async () => {
      sock2.fireMessage({
        type: "recovery_ack",
        missedCount: 1,
        serverCurrentSeq: 6,
      });
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.status).toBe("connected");
    expect(replayFetch).toHaveBeenCalledWith(5, 6);
    expect(backfilled).toContain(6);
  });

  it("treats a missed heartbeat as a dead link and reconnects", () => {
    const { result } = renderHook(() => useWebSocket(baseOptions()));
    const sock = FakeSocket.instances[0];
    act(() => sock.fireOpen());
    expect(result.current.status).toBe("connected");

    // No ping arrives within interval + timeout (20s) → watchdog fires.
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.missedHeartbeats).toBe(1);
    expect(result.current.status).toBe("reconnecting");
  });

  it("surfaces terminal failure after the max attempts", () => {
    const { result } = renderHook(() => useWebSocket(baseOptions()));
    // Fail every connection attempt by closing immediately on open-less sockets.
    act(() => FakeSocket.instances[0].close());
    for (let i = 1; i <= 12; i++) {
      act(() => vi.advanceTimersByTime(30_000));
      const latest = FakeSocket.instances[FakeSocket.instances.length - 1];
      act(() => latest.close());
    }
    expect(result.current.status).toBe("failed");
    expect(connectionStore.getState().status).toBe("failed");
  });
});
