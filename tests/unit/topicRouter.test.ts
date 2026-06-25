import { describe, it, expect, vi } from "vitest";
import {
  TopicRouter,
  coalescenceKey,
  isValidPattern,
  isValidTopic,
} from "@/utils/topicRouter";
import {
  MAX_HANDLERS_PER_TOPIC,
  MAX_SUBSCRIPTIONS,
  type PushPayload,
} from "@/types/notification";

function payload(topic: string, body = "b"): PushPayload {
  return { topic, title: "t", body };
}

describe("pattern / topic validation", () => {
  it("accepts up to three valid segments", () => {
    expect(isValidTopic("meter.water.breach")).toBe(true);
    expect(isValidPattern("meter.water.breach")).toBe(true);
  });

  it("accepts a trailing wildcard pattern", () => {
    expect(isValidPattern("meter.water.*")).toBe(true);
    expect(isValidPattern("meter.*")).toBe(true);
    expect(isValidPattern("*")).toBe(true);
  });

  it("rejects a non-trailing wildcard", () => {
    expect(isValidPattern("meter.*.breach")).toBe(false);
  });

  it("rejects more than three segments and bad characters", () => {
    expect(isValidTopic("a.b.c.d")).toBe(false);
    expect(isValidTopic("Meter.Water")).toBe(false);
    expect(isValidTopic("meter water")).toBe(false);
  });
});

describe("TopicRouter matching", () => {
  it("matches an exact topic", () => {
    const r = new TopicRouter();
    const h = vi.fn();
    r.insert("meter.water.breach", h);
    expect(r.match("meter.water.breach")).toContain(h);
    expect(r.match("meter.water.other")).not.toContain(h);
  });

  it("matches via a same-level trailing wildcard", () => {
    const r = new TopicRouter();
    const h = vi.fn();
    r.insert("meter.water.*", h);
    expect(r.match("meter.water.breach")).toContain(h);
    expect(r.match("meter.gas.breach")).not.toContain(h);
  });

  it("matches via a higher wildcard ancestor", () => {
    const r = new TopicRouter();
    const h = vi.fn();
    r.insert("meter.*", h);
    expect(r.match("meter.water.breach")).toContain(h);
    expect(r.match("meter.gas.low")).toContain(h);
    expect(r.match("contract.execution.reverted")).not.toContain(h);
  });

  it("a root wildcard matches everything", () => {
    const r = new TopicRouter();
    const h = vi.fn();
    r.insert("*", h);
    expect(r.match("system.health.cpu")).toContain(h);
    expect(r.match("contract.execution.reverted")).toContain(h);
  });

  it("collects handlers from the exact path and all wildcard ancestors", () => {
    const r = new TopicRouter();
    const exact = vi.fn();
    const mid = vi.fn();
    const top = vi.fn();
    const root = vi.fn();
    r.insert("meter.water.breach", exact);
    r.insert("meter.water.*", mid);
    r.insert("meter.*", top);
    r.insert("*", root);
    const matched = r.match("meter.water.breach");
    expect(matched).toEqual(expect.arrayContaining([exact, mid, top, root]));
    expect(matched).toHaveLength(4);
  });

  it("does not match a wildcard against a shorter topic", () => {
    const r = new TopicRouter();
    const h = vi.fn();
    r.insert("meter.water.*", h);
    expect(r.match("meter.water")).not.toContain(h);
  });
});

describe("TopicRouter.emit", () => {
  it("invokes all matching handlers with the payload", () => {
    const r = new TopicRouter();
    const a = vi.fn();
    const b = vi.fn();
    r.insert("contract.execution.reverted", a);
    r.insert("contract.*", b);
    const p = payload("contract.execution.reverted");
    expect(r.emit(p)).toBe(2);
    expect(a).toHaveBeenCalledWith(p);
    expect(b).toHaveBeenCalledWith(p);
  });

  it("isolates a throwing handler from the others", () => {
    const r = new TopicRouter();
    const bad = vi.fn(() => {
      throw new Error("boom");
    });
    const good = vi.fn();
    r.insert("system.health.cpu", bad);
    r.insert("system.health.cpu", good);
    expect(() => r.emit(payload("system.health.cpu"))).not.toThrow();
    expect(good).toHaveBeenCalled();
  });
});

describe("TopicRouter unsubscribe & limits", () => {
  it("unsubscribe removes the handler and frees the pattern slot", () => {
    const r = new TopicRouter();
    const h = vi.fn();
    const off = r.insert("meter.water.breach", h);
    expect(r.size).toBe(1);
    off();
    expect(r.match("meter.water.breach")).not.toContain(h);
    expect(r.size).toBe(0);
    off(); // idempotent
    expect(r.size).toBe(0);
  });

  it("throws past the per-topic handler limit", () => {
    const r = new TopicRouter();
    for (let i = 0; i < MAX_HANDLERS_PER_TOPIC; i++) {
      r.insert("meter.water.breach", vi.fn());
    }
    expect(() => r.insert("meter.water.breach", vi.fn())).toThrow(/Handler limit/);
  });

  it("throws past the global subscription limit", () => {
    const r = new TopicRouter();
    for (let i = 0; i < MAX_SUBSCRIPTIONS; i++) {
      r.insert(`meter.water.t${i}`, vi.fn());
    }
    expect(r.size).toBe(MAX_SUBSCRIPTIONS);
    expect(() => r.insert("meter.water.overflow", vi.fn())).toThrow(
      /Subscription limit/
    );
  });

  it("rejects an invalid pattern", () => {
    const r = new TopicRouter();
    expect(() => r.insert("Bad.Topic", vi.fn())).toThrow(/Invalid topic pattern/);
  });
});

describe("coalescenceKey", () => {
  it("combines topic with the first 80 body chars", () => {
    expect(coalescenceKey("meter.water.breach", "leak detected")).toBe(
      "meter.water.breach leak detected"
    );
    const long = "x".repeat(200);
    expect(coalescenceKey("a.b.c", long)).toBe(`a.b.c ${"x".repeat(80)}`);
  });
});
