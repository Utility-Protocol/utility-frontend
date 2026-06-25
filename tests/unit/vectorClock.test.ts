import { describe, it, expect } from "vitest";
import { VectorClock } from "@/utils/vectorClock";

describe("VectorClock", () => {
  // ------------------------------------------------------------------
  // Tick
  // ------------------------------------------------------------------

  it("initialises with zero counters", () => {
    const clock = new VectorClock();
    expect(clock.get("peer-a")).toBe(0);
    expect(clock.get("peer-b")).toBe(0);
  });

  it("tick() increments the counter for a peer", () => {
    const clock = new VectorClock();
    expect(clock.tick("peer-a")).toBe(1);
    expect(clock.tick("peer-a")).toBe(2);
    expect(clock.tick("peer-b")).toBe(1);
    expect(clock.get("peer-a")).toBe(2);
    expect(clock.get("peer-b")).toBe(1);
  });

  it("constructs from an existing map", () => {
    const clock = new VectorClock(
      new Map([
        ["a", 3],
        ["b", 1],
      ])
    );
    expect(clock.get("a")).toBe(3);
    expect(clock.get("b")).toBe(1);
  });

  // ------------------------------------------------------------------
  // Merge
  // ------------------------------------------------------------------

  it("merge takes per-peer maximums", () => {
    const a = new VectorClock(
      new Map([
        ["x", 5],
        ["y", 2],
      ])
    );
    const b = new VectorClock(
      new Map([
        ["x", 3],
        ["y", 7],
        ["z", 1],
      ])
    );
    const merged = a.merge(b);

    expect(merged.get("x")).toBe(5); // max(5, 3)
    expect(merged.get("y")).toBe(7); // max(2, 7)
    expect(merged.get("z")).toBe(1); // only in b
    expect(merged.get("w")).toBe(0); // absent
  });

  it("merge is commutative", () => {
    const a = new VectorClock(new Map([["p", 4]]));
    const b = new VectorClock(new Map([["p", 4]]));
    const ab = a.merge(b);
    const ba = b.merge(a);
    expect(ab.get("p")).toBe(ba.get("p"));
  });

  // ------------------------------------------------------------------
  // Compare
  // ------------------------------------------------------------------

  it("two equal clocks are concurrent", () => {
    const a = new VectorClock(new Map([["p", 2]]));
    const b = new VectorClock(new Map([["p", 2]]));
    expect(a.compare(b)).toBe("Concurrent");
  });

  it("detects Before (a < b)", () => {
    // a = {p: 1}, b = {p: 2}
    const a = new VectorClock(new Map([["p", 1]]));
    const b = new VectorClock(new Map([["p", 2]]));
    expect(a.compare(b)).toBe("Before");
    expect(b.compare(a)).toBe("After");
  });

  it("detects After (a > b)", () => {
    const a = new VectorClock(
      new Map([
        ["p", 3],
        ["q", 1],
      ])
    );
    const b = new VectorClock(new Map([["p", 2]]));
    // a dominates on p AND has q that b doesn't
    expect(a.compare(b)).toBe("After");
    expect(b.compare(a)).toBe("Before");
  });

  it("detects concurrent when neither dominates", () => {
    const a = new VectorClock(
      new Map([
        ["p", 3],
        ["q", 1],
      ])
    );
    const b = new VectorClock(
      new Map([
        ["p", 2],
        ["q", 3],
      ])
    );
    // a is ahead on p, b is ahead on q
    expect(a.compare(b)).toBe("Concurrent");
    expect(b.compare(a)).toBe("Concurrent");
  });

  it("handles empty clocks", () => {
    const a = new VectorClock();
    const b = new VectorClock(new Map([["p", 1]]));
    expect(a.compare(b)).toBe("Before"); // empty has all counters ≤ non-empty
    expect(b.compare(a)).toBe("After");
  });

  // ------------------------------------------------------------------
  // JSON serialisation
  // ------------------------------------------------------------------

  it("serialises to JSON and back", () => {
    const original = new VectorClock(
      new Map([
        ["a", 5],
        ["b", 3],
      ])
    );
    const json = original.toJSON();
    const restored = VectorClock.fromJSON(json);
    expect(restored.get("a")).toBe(5);
    expect(restored.get("b")).toBe(3);
    expect(original.compare(restored)).toBe("Concurrent");
  });

  // ------------------------------------------------------------------
  // Clone
  // ------------------------------------------------------------------

  it("clone creates an independent copy", () => {
    const original = new VectorClock(new Map([["p", 1]]));
    const clone = original.clone();
    original.tick("p"); // original → 2
    expect(clone.get("p")).toBe(1);
    expect(original.get("p")).toBe(2);
  });
});
