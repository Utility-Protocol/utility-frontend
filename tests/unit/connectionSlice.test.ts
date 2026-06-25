import { describe, it, expect, beforeEach } from "vitest";
import {
  connectionStore,
  deriveQuality,
} from "@/store/slices/connectionSlice";

describe("deriveQuality", () => {
  it("is good when connected, no missed beats, low latency", () => {
    expect(deriveQuality("connected", 0, 20)).toBe("good");
  });

  it("is degraded when connected but a heartbeat was missed", () => {
    expect(deriveQuality("connected", 1, 20)).toBe("degraded");
  });

  it("is degraded when connected but latency exceeds the heartbeat timeout", () => {
    expect(deriveQuality("connected", 0, 6000)).toBe("degraded");
  });

  it("is degraded for transitional states", () => {
    expect(deriveQuality("connecting", 0, -1)).toBe("degraded");
    expect(deriveQuality("reconnecting", 0, -1)).toBe("degraded");
    expect(deriveQuality("recovering", 0, -1)).toBe("degraded");
  });

  it("is down when failed or idle", () => {
    expect(deriveQuality("failed", 0, -1)).toBe("down");
    expect(deriveQuality("idle", 0, -1)).toBe("down");
  });
});

describe("connectionStore", () => {
  beforeEach(() => connectionStore.dispatch({ type: "RESET" }));

  it("updates status and derives quality", () => {
    connectionStore.dispatch({
      type: "CONNECTION_STATUS_CHANGED",
      payload: { status: "connected" },
    });
    const s = connectionStore.getState();
    expect(s.status).toBe("connected");
    expect(s.quality).toBe("good");
  });

  it("tracks reconnect attempts and scheduled delay", () => {
    connectionStore.dispatch({
      type: "CONNECTION_STATUS_CHANGED",
      payload: { status: "reconnecting", attempt: 3, nextDelayMs: 1234 },
    });
    const s = connectionStore.getState();
    expect(s.status).toBe("reconnecting");
    expect(s.attempt).toBe(3);
    expect(s.nextDelayMs).toBe(1234);
    expect(s.quality).toBe("degraded");
  });

  it("clears missed heartbeats when (re)connected", () => {
    connectionStore.dispatch({
      type: "HEARTBEAT_MISSED",
      payload: { missedHeartbeats: 2 },
    });
    expect(connectionStore.getState().missedHeartbeats).toBe(2);
    connectionStore.dispatch({
      type: "CONNECTION_STATUS_CHANGED",
      payload: { status: "connected" },
    });
    expect(connectionStore.getState().missedHeartbeats).toBe(0);
  });

  it("stores the sticky node id", () => {
    connectionStore.dispatch({
      type: "NODE_ID_ASSIGNED",
      payload: { nodeId: "node-7" },
    });
    expect(connectionStore.getState().nodeId).toBe("node-7");
  });

  it("records terminal failure with an error and down quality", () => {
    connectionStore.dispatch({
      type: "CONNECTION_FAILED",
      payload: { error: "gave up" },
    });
    const s = connectionStore.getState();
    expect(s.status).toBe("failed");
    expect(s.quality).toBe("down");
    expect(s.lastError).toBe("gave up");
  });

  it("CONNECTION_RECOVERED resets attempts and clears the error", () => {
    connectionStore.dispatch({
      type: "CONNECTION_STATUS_CHANGED",
      payload: { status: "reconnecting", attempt: 5 },
    });
    connectionStore.dispatch({ type: "CONNECTION_RECOVERED" });
    const s = connectionStore.getState();
    expect(s.status).toBe("connected");
    expect(s.attempt).toBe(0);
    expect(s.lastError).toBeNull();
  });

  it("notifies subscribers", () => {
    const seen: string[] = [];
    const unsub = connectionStore.subscribe((s) => seen.push(s.status));
    connectionStore.dispatch({
      type: "CONNECTION_STATUS_CHANGED",
      payload: { status: "connecting" },
    });
    unsub();
    connectionStore.dispatch({
      type: "CONNECTION_STATUS_CHANGED",
      payload: { status: "connected" },
    });
    expect(seen).toEqual(["connecting"]);
  });
});
