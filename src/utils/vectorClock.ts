/**
 * Lamport Vector Clock for CRDT-based conflict resolution.
 *
 * Each peer maintains a map of peerId → logical counter. The clock
 * is used to determine the causal relationship between two operations
 * and to merge incoming state from other peers.
 *
 * Comparison results:
 *   Before     — this clock is strictly behind `other`
 *   After      — this clock is strictly ahead of `other`
 *   Concurrent — neither dominates (conflicting edits)
 */

export type ClockMap = Map<string, number>;

export type Ordering = "Before" | "After" | "Concurrent";

export class VectorClock {
  private entries: ClockMap;

  constructor(initial?: ClockMap) {
    this.entries = initial ? new Map(initial) : new Map();
  }

  /** Increment this peer's counter and return the new value. */
  tick(peerId: string): number {
    const current = this.entries.get(peerId) ?? 0;
    const next = current + 1;
    this.entries.set(peerId, next);
    return next;
  }

  /** Get the current counter for a peer (0 if unknown). */
  get(peerId: string): number {
    return this.entries.get(peerId) ?? 0;
  }

  /**
   * Merge another vector clock into this one by taking the per-peer
   * maximums. Returns a new VectorClock (immutable-style).
   */
  merge(other: VectorClock): VectorClock {
    const merged = new Map(this.entries);
    for (const [peerId, counter] of other.entries) {
      const existing = merged.get(peerId) ?? 0;
      if (counter > existing) {
        merged.set(peerId, counter);
      }
    }
    return new VectorClock(merged);
  }

  /**
   * Compare this clock against `other`.
   *
   * - Before: every entry in this is ≤ the corresponding entry in other,
   *           AND at least one is strictly less.
   * - After:  every entry in other is ≤ the corresponding entry in this,
   *           AND at least one is strictly less.
   * - Concurrent: neither dominates.
   */
  compare(other: VectorClock): Ordering {
    let hasLess = false;
    let hasGreater = false;

    const allPeerIds = new Set<string>();
    for (const id of this.entries.keys()) allPeerIds.add(id);
    for (const id of other.entries.keys()) allPeerIds.add(id);

    for (const peerId of allPeerIds) {
      const self = this.get(peerId);
      const oth = other.get(peerId);
      if (self < oth) hasGreater = true; // other is ahead
      if (self > oth) hasLess = true; // this is ahead
    }

    if (!hasLess && !hasGreater) return "Concurrent";
    if (hasLess && !hasGreater) return "After";
    if (!hasLess && hasGreater) return "Before";
    return "Concurrent";
  }

  /** Serialise to a plain object for transmission / storage. */
  toJSON(): Record<string, number> {
    return Object.fromEntries(this.entries);
  }

  /** Deserialise from a plain object. */
  static fromJSON(json: Record<string, number>): VectorClock {
    return new VectorClock(new Map(Object.entries(json)));
  }

  /** Shallow clone. */
  clone(): VectorClock {
    return new VectorClock(new Map(this.entries));
  }
}
