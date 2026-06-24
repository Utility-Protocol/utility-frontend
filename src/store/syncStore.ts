/**
 * SyncStore — lightweight sync state store.
 *
 * Tracks peer connections, outbox queue, and per-peer vector clocks.
 * Designed to be used by the useOfflineSync hook to expose reactive
 * state to React components via a simple subscription pattern.
 */

import { VectorClock } from "@/utils/vectorClock";
import type { SyncEntry } from "@/services/webrtc/SyncPeer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PeerInfo {
  id: string;
  connected: boolean;
  latency: number;
  lastSync: number;
  /** This peer's vector clock (our view). */
  vectorClock: VectorClock;
}

export interface SyncState {
  peers: PeerInfo[];
  outbox: SyncEntry[];
  /** Our outgoing vector clock. */
  ourClock: VectorClock;
}

type Listener = (state: SyncState) => void;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

class SyncStore {
  private state: SyncState = {
    peers: [],
    outbox: [],
    ourClock: new VectorClock(),
  };
  private listeners = new Set<Listener>();

  getState(): Readonly<SyncState> {
    return this.state;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Add an entry to the outbox queue. */
  enqueue(entry: SyncEntry): void {
    this.state = { ...this.state, outbox: [...this.state.outbox, entry] };
    this.notify();
  }

  /** Remove entries by IDs from the outbox (after successful sync). */
  dequeue(entryIds: string[]): void {
    const ids = new Set(entryIds);
    this.state = {
      ...this.state,
      outbox: this.state.outbox.filter((e) => !ids.has(e.id)),
    };
    this.notify();
  }

  /** Add or update a peer. */
  upsertPeer(peer: PeerInfo): void {
    const idx = this.state.peers.findIndex((p) => p.id === peer.id);
    const peers = [...this.state.peers];
    if (idx >= 0) {
      peers[idx] = peer;
    } else {
      peers.push(peer);
    }
    this.state = { ...this.state, peers };
    this.notify();
  }

  /** Remove a peer. */
  removePeer(peerId: string): void {
    this.state = {
      ...this.state,
      peers: this.state.peers.filter((p) => p.id !== peerId),
    };
    this.notify();
  }

  /** Update our local vector clock (tick + merge incoming). */
  updateOurClock(clock: VectorClock): void {
    this.state = { ...this.state, ourClock: clock };
    this.notify();
  }

  /** Replace the entire state (used for rehydration). */
  setState(next: SyncState): void {
    this.state = next;
    this.notify();
  }

  /** Reset the store. */
  reset(): void {
    this.state = { peers: [], outbox: [], ourClock: new VectorClock() };
    this.notify();
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }
}

/** Singleton sync store instance. */
export const syncStore = new SyncStore();
