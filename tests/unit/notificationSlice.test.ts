import { describe, it, expect } from "vitest";
import { NotificationStore } from "@/store/slices/notificationSlice";
import type { PushPayload } from "@/types/notification";

/** A controllable scheduler so coalescence timers can be driven deterministically. */
function fakeScheduler() {
  let nextId = 1;
  let clock = 0;
  const timers = new Map<number, { fireAt: number; cb: () => void }>();
  return {
    now: () => clock,
    setTimeoutFn: (cb: () => void, ms: number) => {
      const id = nextId++;
      timers.set(id, { fireAt: clock + ms, cb });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeoutFn: (id: ReturnType<typeof setTimeout>) => {
      timers.delete(id as unknown as number);
    },
    advance: (ms: number) => {
      clock += ms;
      for (const [id, t] of [...timers.entries()]) {
        if (t.fireAt <= clock) {
          timers.delete(id);
          t.cb();
        }
      }
    },
    pending: () => timers.size,
  };
}

function makeStore(sched: ReturnType<typeof fakeScheduler>) {
  return new NotificationStore({
    setTimeoutFn: sched.setTimeoutFn,
    clearTimeoutFn: sched.clearTimeoutFn,
    now: sched.now,
    window: 60_000,
  });
}

function payload(topic: string, body: string, extra?: Partial<PushPayload>): PushPayload {
  return { topic, title: "Title", body, ...extra };
}

describe("NotificationStore coalescence", () => {
  it("creates a notification with count 1", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    const key = store.receive(payload("meter.water.breach", "leak"));
    const state = store.getState();
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe(key);
    expect(state[0].count).toBe(1);
  });

  it("coalesces identical events into a single incremented entry", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    store.receive(payload("meter.water.breach", "leak"));
    store.receive(payload("meter.water.breach", "leak"));
    store.receive(payload("meter.water.breach", "leak"));
    const state = store.getState();
    expect(state).toHaveLength(1);
    expect(state[0].count).toBe(3);
  });

  it("keeps distinct keys separate", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    store.receive(payload("meter.water.breach", "leak"));
    store.receive(payload("contract.execution.reverted", "tx failed"));
    expect(store.getState()).toHaveLength(2);
  });

  it("auto-dismisses after the coalescence window", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    store.receive(payload("system.health.cpu", "spike"));
    expect(store.getState()).toHaveLength(1);
    sched.advance(60_000);
    expect(store.getState()).toHaveLength(0);
  });

  it("extends the window on each repeat occurrence", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    store.receive(payload("system.health.cpu", "spike"));
    sched.advance(40_000); // not yet expired
    store.receive(payload("system.health.cpu", "spike")); // resets the 60s timer
    sched.advance(40_000); // 80s since first, but only 40s since last
    expect(store.getState()).toHaveLength(1);
    expect(store.getState()[0].count).toBe(2);
    sched.advance(20_000); // now 60s since last
    expect(store.getState()).toHaveLength(0);
  });

  it("dismiss removes the entry and cancels its timer", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    const key = store.receive(payload("meter.water.breach", "leak"));
    store.dismiss(key);
    expect(store.getState()).toHaveLength(0);
    expect(sched.pending()).toBe(0);
  });

  it("caps actions at two", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    store.receive(
      payload("meter.water.breach", "leak", {
        actions: [
          { action: "a", title: "A" },
          { action: "b", title: "B" },
          { action: "c", title: "C" },
        ],
      })
    );
    expect(store.getState()[0].actions).toHaveLength(2);
  });

  it("returns a stable snapshot reference when unchanged", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    const a = store.getState();
    const b = store.getState();
    expect(a).toBe(b);
  });

  it("clear() empties the queue and cancels timers", () => {
    const sched = fakeScheduler();
    const store = makeStore(sched);
    store.receive(payload("meter.water.breach", "leak"));
    store.receive(payload("system.health.cpu", "spike"));
    store.clear();
    expect(store.getState()).toHaveLength(0);
    expect(sched.pending()).toBe(0);
  });
});
