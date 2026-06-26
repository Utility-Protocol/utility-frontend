/**
 * Pure CRDT merge engine. Shared by the merge worker and the tests.
 *
 * - LWW register: keep the value with the greater Lamport timestamp.
 * - OR-set: tag-based add / tombstone remove; an element is present iff it has
 *   an add-tag that is not tombstoned. Both operations are commutative,
 *   associative and idempotent, so any interleaving of a batch converges.
 */

import { compareTimestamp } from "@/utils/lamportClock";
import {
  type ChainId,
  type CrdtEvent,
  type LWWRegister,
  type LamportTimestamp,
  type MergeResult,
  type ORSet,
  type ResourceDiff,
  type ResourceState,
  type VectorClock,
} from "@/types/crdt";

const unique = <T>(arr: T[]): T[] => [...new Set(arr)];

// --- LWW register -----------------------------------------------------------

export function mergeRegister<T>(
  a: LWWRegister<T>,
  b: LWWRegister<T>
): LWWRegister<T> {
  return compareTimestamp(a.timestamp, b.timestamp) >= 0 ? a : b;
}

// --- OR-set -----------------------------------------------------------------

export function emptyOrSet<T extends string>(): ORSet<T> {
  return { kind: "or-set", adds: {}, tombstones: [], values: {} };
}

export function orSetAdd<T extends string>(
  set: ORSet<T>,
  element: T,
  tag: string
): ORSet<T> {
  return {
    kind: "or-set",
    adds: { ...set.adds, [element]: unique([...(set.adds[element] ?? []), tag]) },
    tombstones: set.tombstones,
    values: { ...set.values, [element]: element },
  };
}

/** The add-tags of `element` that are not yet tombstoned (what a remove sees). */
export function observedTags<T extends string>(
  set: ORSet<T>,
  element: T
): string[] {
  const tombstoned = new Set(set.tombstones);
  return (set.adds[element] ?? []).filter((t) => !tombstoned.has(t));
}

/** Tombstone a specific set of add-tags (commutative / idempotent). */
export function orSetRemoveTags<T extends string>(
  set: ORSet<T>,
  tags: string[]
): ORSet<T> {
  if (tags.length === 0) return set;
  return {
    kind: "or-set",
    adds: set.adds,
    tombstones: unique([...set.tombstones, ...tags]),
    values: set.values,
  };
}

/** Convenience: remove an element by tombstoning its currently-observed tags. */
export function orSetRemove<T extends string>(
  set: ORSet<T>,
  element: T
): ORSet<T> {
  return orSetRemoveTags(set, observedTags(set, element));
}

export function orSetMerge<T extends string>(
  a: ORSet<T>,
  b: ORSet<T>
): ORSet<T> {
  const adds: Record<string, string[]> = { ...a.adds };
  for (const [el, tags] of Object.entries(b.adds)) {
    adds[el] = unique([...(adds[el] ?? []), ...tags]);
  }
  return {
    kind: "or-set",
    adds,
    tombstones: unique([...a.tombstones, ...b.tombstones]),
    values: { ...a.values, ...b.values },
  };
}

/** Materialise the present elements of an OR-set. */
export function orSetValues<T extends string>(set: ORSet<T>): T[] {
  const tombstoned = new Set(set.tombstones);
  const out: T[] = [];
  for (const [el, tags] of Object.entries(set.adds)) {
    if (tags.some((t) => !tombstoned.has(t))) out.push(set.values[el]);
  }
  return out;
}

// --- Vector clock -----------------------------------------------------------

function bumpClock(clock: VectorClock, ts: LamportTimestamp): VectorClock {
  const current = clock[ts.chainId] ?? 0;
  if (ts.counter <= current) return clock;
  return { ...clock, [ts.chainId]: ts.counter };
}

// --- Event application -------------------------------------------------------

function applyEvent(
  state: ResourceState | undefined,
  event: CrdtEvent
): ResourceState {
  switch (event.type) {
    case "register-set": {
      const incoming: LWWRegister = {
        kind: "lww",
        value: event.value,
        timestamp: event.timestamp,
      };
      if (state && state.kind === "lww") return mergeRegister(state, incoming);
      return incoming;
    }
    case "or-set-add": {
      const set =
        state && state.kind === "or-set"
          ? (state as ORSet<string>)
          : emptyOrSet<string>();
      return orSetAdd(set, event.element, event.tag);
    }
    case "or-set-remove": {
      const set =
        state && state.kind === "or-set"
          ? (state as ORSet<string>)
          : emptyOrSet<string>();
      // Tombstone exactly the observed tags → order-independent merge.
      return orSetRemoveTags(set, event.tags);
    }
  }
}

/**
 * Merge a batch of incoming events into the current state, grouped by resource.
 * Returns the per-resource diffs (final state + vector clock) and the highest
 * counter seen per chain (for the staleness watcher). Inputs are not mutated.
 */
export function mergeEvents(
  states: Record<string, ResourceState>,
  clocks: Record<string, VectorClock>,
  events: CrdtEvent[]
): MergeResult {
  const touched = new Map<string, ResourceState>();
  const touchedClocks = new Map<string, VectorClock>();
  const chainSeen: Partial<Record<ChainId, number>> = {};

  for (const event of events) {
    const id = event.resourceId;
    const current = touched.get(id) ?? states[id];
    touched.set(id, applyEvent(current, event));

    const clock = touchedClocks.get(id) ?? clocks[id] ?? {};
    touchedClocks.set(id, bumpClock(clock, event.timestamp));

    const { chainId, counter } = event.timestamp;
    if ((chainSeen[chainId] ?? 0) < counter) chainSeen[chainId] = counter;
  }

  const diffs: ResourceDiff[] = [];
  for (const [resourceId, state] of touched) {
    diffs.push({
      resourceId,
      state,
      vectorClock: touchedClocks.get(resourceId) ?? {},
    });
  }
  return { diffs, chainSeen };
}
