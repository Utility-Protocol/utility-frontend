import { describe, it, expect } from "vitest";
import { ReconnectMachine } from "@/services/reconnectMachine";

/** Deterministic machine: jitter rng pinned to 0.5. */
function machine() {
  return new ReconnectMachine({ rng: () => 0.5 });
}

describe("ReconnectMachine", () => {
  it("connects from idle and reaches connected on first open", () => {
    const m = machine();
    m.send({ type: "CONNECT" });
    expect(m.status).toBe("connecting");
    m.send({ type: "CONNECTED" });
    expect(m.status).toBe("connected");
    expect(m.getContext().attempt).toBe(0);
  });

  it("enters reconnecting with a jittered delay on disconnect", () => {
    const m = machine();
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    m.send({ type: "DISCONNECTED" });
    const ctx = m.getContext();
    expect(ctx.status).toBe("reconnecting");
    expect(ctx.attempt).toBe(1);
    // ceiling(0) = 500, rng 0.5 → 250
    expect(ctx.nextDelayMs).toBe(250);
  });

  it("RETRY moves reconnecting → connecting", () => {
    const m = machine();
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    m.send({ type: "DISCONNECTED" });
    m.send({ type: "RETRY" });
    expect(m.status).toBe("connecting");
    expect(m.getContext().nextDelayMs).toBeNull();
  });

  it("re-open after an outage routes through recovering, not connected", () => {
    const m = machine();
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    m.send({ type: "DISCONNECTED" }); // attempt 1
    m.send({ type: "RETRY" });
    m.send({ type: "CONNECTED" });
    expect(m.status).toBe("recovering");
    m.send({ type: "RECOVERY_SUCCESS" });
    expect(m.status).toBe("connected");
    expect(m.getContext().attempt).toBe(0);
  });

  it("backoff ceiling grows with each consecutive failed attempt", () => {
    const m = machine();
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    const delays: number[] = [];
    for (let i = 0; i < 4; i++) {
      m.send({ type: "DISCONNECTED" });
      delays.push(m.getContext().nextDelayMs!);
      m.send({ type: "RETRY" });
    }
    // rng 0.5 × ceiling(0..3) = 0.5 × [500,1000,2000,4000]
    expect(delays).toEqual([250, 500, 1000, 2000]);
  });

  it("declares terminal failure after the max attempts", () => {
    const m = new ReconnectMachine({ rng: () => 0.5, maxAttempts: 3 });
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    // 3 allowed attempts, the 4th tips into failed.
    for (let i = 0; i < 3; i++) {
      m.send({ type: "DISCONNECTED" });
      expect(m.status).toBe("reconnecting");
      m.send({ type: "RETRY" });
    }
    m.send({ type: "DISCONNECTED" });
    expect(m.status).toBe("failed");
    expect(m.isTerminal).toBe(true);
    expect(m.getContext().lastError).toMatch(/after 3 attempts/);
  });

  it("a failed machine can be manually reconnected", () => {
    const m = new ReconnectMachine({ rng: () => 0.5, maxAttempts: 1 });
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    m.send({ type: "DISCONNECTED" }); // attempt 1
    m.send({ type: "RETRY" });
    m.send({ type: "DISCONNECTED" }); // attempt 2 > max → failed
    expect(m.status).toBe("failed");
    m.send({ type: "CONNECT" });
    expect(m.status).toBe("connecting");
    expect(m.getContext().attempt).toBe(0);
  });

  it("heartbeat timeout triggers a reconnect", () => {
    const m = machine();
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    const count = m.recordMissedHeartbeat();
    expect(count).toBe(1);
    m.send({ type: "HEARTBEAT_TIMEOUT" });
    expect(m.status).toBe("reconnecting");
    expect(m.getContext().lastError).toMatch(/Heartbeat/);
  });

  it("RESET returns to idle from any state", () => {
    const m = machine();
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    m.send({ type: "DISCONNECTED" });
    m.send({ type: "RESET" });
    expect(m.status).toBe("idle");
    expect(m.getContext().attempt).toBe(0);
  });

  it("notifies subscribers on transitions", () => {
    const m = machine();
    const seen: string[] = [];
    m.subscribe((ctx) => seen.push(ctx.status));
    m.send({ type: "CONNECT" });
    m.send({ type: "CONNECTED" });
    expect(seen).toEqual(["connecting", "connected"]);
  });
});
