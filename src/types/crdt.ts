/**
 * Types for the multi-chain Soroban state synchronizer.
 *
 * The same logical resource (e.g. a meter reading) can be emitted by several
 * chains at different latencies. CRDTs merge those concurrent updates
 * deterministically so the local store always converges:
 *   - scalar readings → Last-Writer-Wins register
 *   - collections     → Observed-Remove set (tombstone-based)
 *
 * Ordering uses a Lamport timestamp `(chainId, counter)` with chain priority
 * (mainnet > testnet > futurenet) as the tie-breaker.
 */

export type ChainId = "mainnet" | "testnet" | "futurenet";

/** Higher wins ties. */
export const CHAIN_PRIORITY: Record<ChainId, number> = {
  mainnet: 3,
  testnet: 2,
  futurenet: 1,
};

/** Lamport timestamp: a logical counter tagged with its originating chain. */
export interface LamportTimestamp {
  chainId: ChainId;
  counter: number;
}

/** Last-Writer-Wins register for a scalar value. */
export interface LWWRegister<T = unknown> {
  kind: "lww";
  value: T;
  timestamp: LamportTimestamp;
}

/**
 * Observed-Remove set state. Each element maps to the set of unique tags that
 * added it; `tombstones` holds tags that have been removed. An element is
 * present iff it has at least one add-tag not in `tombstones`.
 */
export interface ORSet<T = string> {
  kind: "or-set";
  /** element (serialized) → add tags. */
  adds: Record<string, string[]>;
  /** removed add-tags. */
  tombstones: string[];
  /** Original element values keyed by their serialized form. */
  values: Record<string, T>;
}

export type ResourceState<T = unknown> = LWWRegister<T> | ORSet<T & string>;

/** Per-resource vector clock: highest counter observed from each chain. */
export type VectorClock = Partial<Record<ChainId, number>>;

// --- Events -----------------------------------------------------------------

interface BaseEvent {
  resourceId: string;
  timestamp: LamportTimestamp;
}

/** Set a scalar register value. */
export interface RegisterSetEvent<T = unknown> extends BaseEvent {
  type: "register-set";
  value: T;
}

/** Add an element to an OR-set (carries the unique add-tag). */
export interface OrSetAddEvent<T = string> extends BaseEvent {
  type: "or-set-add";
  element: T;
  tag: string;
}

/**
 * Remove an element from an OR-set. Carries the exact add-tags the remover
 * observed, so the operation is commutative regardless of merge order (only
 * those tags are tombstoned; concurrent adds with fresh tags survive).
 */
export interface OrSetRemoveEvent<T = string> extends BaseEvent {
  type: "or-set-remove";
  element: T;
  tags: string[];
}

export type CrdtEvent<T = unknown> =
  | RegisterSetEvent<T>
  | OrSetAddEvent<T & string>
  | OrSetRemoveEvent<T & string>;

// --- Diffs (worker → store) -------------------------------------------------

/** A merged resource patch produced by the merge worker. */
export interface ResourceDiff {
  resourceId: string;
  state: ResourceState;
  /** Vector clock after applying the batch. */
  vectorClock: VectorClock;
}

export interface MergeResult {
  diffs: ResourceDiff[];
  /** Highest counter seen per chain in this batch (for the staleness watcher). */
  chainSeen: Partial<Record<ChainId, number>>;
}

// --- Invariants -------------------------------------------------------------

/** Ledger closes (~5 s each) before a chain is force-reconciled. */
export const MAX_DRIFT_LEDGERS = 12;
/** Approx wall-clock equivalent of {@link MAX_DRIFT_LEDGERS} (ms). */
export const RECONCILE_TIMEOUT_MS = 60_000;
