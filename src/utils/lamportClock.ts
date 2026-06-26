/**
 * Lamport timestamps with chain-priority tie-breaking.
 *
 * A timestamp is `(chainId, counter)`. Ordering is by `counter`, and ties (the
 * "concurrent" case) are broken deterministically by chain priority
 * (mainnet > testnet > futurenet) so every replica converges to the same winner.
 */

import {
  CHAIN_PRIORITY,
  type ChainId,
  type LamportTimestamp,
} from "@/types/crdt";

/**
 * Total order over Lamport timestamps. Returns -1 / 0 / 1. Two timestamps are
 * equal only when they share both chain and counter.
 */
export function compareTimestamp(
  a: LamportTimestamp,
  b: LamportTimestamp
): -1 | 0 | 1 {
  if (a.counter !== b.counter) return a.counter < b.counter ? -1 : 1;
  const pa = CHAIN_PRIORITY[a.chainId];
  const pb = CHAIN_PRIORITY[b.chainId];
  if (pa !== pb) return pa < pb ? -1 : 1;
  return 0;
}

/** True when `a` strictly dominates `b` in the total order. */
export function dominates(a: LamportTimestamp, b: LamportTimestamp): boolean {
  return compareTimestamp(a, b) === 1;
}

/** The greater of two timestamps (ties → the higher-priority chain). */
export function maxTimestamp(
  a: LamportTimestamp,
  b: LamportTimestamp
): LamportTimestamp {
  return compareTimestamp(a, b) >= 0 ? a : b;
}

/** Per-chain Lamport clock. */
export class LamportClock {
  constructor(
    readonly chainId: ChainId,
    private counter = 0
  ) {}

  /** Current counter value (without advancing). */
  get value(): number {
    return this.counter;
  }

  /** Advance the clock and stamp a new local event. */
  tick(): LamportTimestamp {
    this.counter += 1;
    return { chainId: this.chainId, counter: this.counter };
  }

  /** Merge in a remote timestamp (Lamport receive rule). */
  observe(remote: LamportTimestamp): void {
    if (remote.counter > this.counter) this.counter = remote.counter;
  }

  /**
   * Observe a remote timestamp and immediately stamp a derived local event
   * (receive-then-send): `counter = max(local, remote) + 1`.
   */
  tickAfter(remote: LamportTimestamp): LamportTimestamp {
    this.observe(remote);
    return this.tick();
  }

  peek(): LamportTimestamp {
    return { chainId: this.chainId, counter: this.counter };
  }
}
