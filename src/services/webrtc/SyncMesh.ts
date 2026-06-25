/**
 * SyncMesh — WebRTC peer-to-peer mesh manager.
 *
 * Maintains a fully-connected mesh of up to 20 direct connections.
 * Beyond 20 peers, connections are routed through a spanning tree
 * computed from latency estimates.
 *
 * Relays SDP offers, answers, and ICE candidates from SyncPeer to the
 * parent handler for signaling.
 */

import { SyncPeer } from "./SyncPeer";
import type { SyncEntry, PeerEvent } from "./SyncPeer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MeshEvent =
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "sync-received"; fromPeerId: string; entries: SyncEntry[] }
  | { type: "error"; peerId: string; message: string }
  | { type: "sdp-offer"; sdp: string; fromPeerId: string }
  | { type: "sdp-answer"; sdp: string; fromPeerId: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit; fromPeerId: string };

export type MeshEventHandler = (event: MeshEvent) => void;

const MAX_DIRECT_PEERS = 20;

// ---------------------------------------------------------------------------
// SyncMesh
// ---------------------------------------------------------------------------

export class SyncMesh {
  private peers = new Map<string, SyncPeer>();
  private handler: MeshEventHandler | null = null;
  private myPeerId: string;
  private iceServers: RTCIceServer[];
  private latencies = new Map<string, number>();
  private spanningTree = new Map<string, string[]>();
  private treeDirty = false;

  constructor(
    myPeerId: string,
    iceServers?: RTCIceServer[]
  ) {
    this.myPeerId = myPeerId;
    this.iceServers = iceServers ?? [
      { urls: "stun:stun.l.google.com:19302" },
    ];
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  onEvent(handler: MeshEventHandler): void {
    this.handler = handler;
  }

  /**
   * Join the mesh with a new peer.
   *
   * If `remoteSdp` is provided, we are the answerer.
   * Otherwise, we are the initiator and the SDP offer will be emitted
   * via `sdp-offer` MeshEvent.
   */
  async join(peerId: string, remoteSdp?: string): Promise<void> {
    if (peerId === this.myPeerId) return;

    // Clean up existing connection to this peer
    this.peers.get(peerId)?.close();
    this.peers.delete(peerId);

    const peer = new SyncPeer({
      peerId,
      iceServers: this.iceServers,
      isInitiator: !remoteSdp,
    });

    this.listenToPeer(peer);
    this.peers.set(peerId, peer);
    await peer.connect();

    if (remoteSdp) {
      const answerSdp = await peer.handleOffer(remoteSdp);
      if (answerSdp) {
        this.handler?.({ type: "sdp-answer", sdp: answerSdp, fromPeerId: peerId });
      }
    }

    this.treeDirty = true;
    this.handler?.({ type: "peer-joined", peerId });
  }

  /** Handle a remote SDP answer. */
  async handleAnswer(peerId: string, sdp: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    await peer.handleAnswer(sdp);
  }

  /** Handle a remote ICE candidate. */
  async handleIceCandidate(
    peerId: string,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) return;
    await peer.addIceCandidate(candidate);
  }

  /** Broadcast sync entries to all connected peers. */
  broadcast(entries: SyncEntry[]): void {
    if (this.peers.size <= MAX_DIRECT_PEERS) {
      for (const peer of this.peers.values()) {
        if (peer.isConnected) {
          peer.send(entries);
        }
      }
    } else {
      this.ensureSpanningTree();
      const neighbours = this.spanningTree.get(this.myPeerId) ?? [];
      for (const neighbourId of neighbours) {
        const peer = this.peers.get(neighbourId);
        if (peer?.isConnected) {
          peer.send(entries);
        }
      }
    }
  }

  /** Remove a peer from the mesh. */
  leave(peerId: string): void {
    this.peers.get(peerId)?.close();
    this.peers.delete(peerId);
    this.treeDirty = true;
    this.handler?.({ type: "peer-left", peerId });
  }

  /** Remove all peers and destroy connections. */
  destroy(): void {
    for (const peer of this.peers.values()) {
      peer.close();
    }
    this.peers.clear();
    this.spanningTree.clear();
    this.latencies.clear();
  }

  /** Number of connected peers. */
  get connectedCount(): number {
    let count = 0;
    for (const peer of this.peers.values()) {
      if (peer.isConnected) count++;
    }
    return count;
  }

  /** List of connected peer IDs. */
  get connectedPeerIds(): string[] {
    return Array.from(this.peers.entries())
      .filter(([, peer]) => peer.isConnected)
      .map(([id]) => id);
  }

  /** Update the latency estimate for a peer. */
  updateLatency(peerId: string, latencyMs: number): void {
    this.latencies.set(peerId, latencyMs);
    this.treeDirty = true;
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private listenToPeer(peer: SyncPeer): void {
    peer.onEvent((event: PeerEvent) => {
      switch (event.type) {
        case "connected":
          this.handler?.({ type: "peer-joined", peerId: event.peerId });
          break;
        case "disconnected":
          this.peers.delete(event.peerId);
          this.treeDirty = true;
          this.handler?.({ type: "peer-left", peerId: event.peerId });
          break;
        case "data":
          if (this.peers.size > MAX_DIRECT_PEERS) {
            this.relayEntries(event.peerId, event.entries);
          }
          this.handler?.({
            type: "sync-received",
            fromPeerId: event.peerId,
            entries: event.entries,
          });
          break;
        case "error":
          this.handler?.({
            type: "error",
            peerId: event.peerId,
            message: event.message,
          });
          break;
        case "sdp-ready":
          this.handler?.({
            type: "sdp-offer",
            sdp: event.sdp,
            fromPeerId: event.peerId,
          });
          break;
        case "ice-candidate":
          this.handler?.({
            type: "ice-candidate",
            candidate: event.candidate,
            fromPeerId: event.peerId,
          });
          break;
      }
    });
  }

  private relayEntries(fromPeerId: string, entries: SyncEntry[]): void {
    this.ensureSpanningTree();
    const neighbours = this.spanningTree.get(this.myPeerId) ?? [];
    for (const neighbourId of neighbours) {
      if (neighbourId === fromPeerId) continue;
      this.peers.get(neighbourId)?.send(entries);
    }
  }

  private ensureSpanningTree(): void {
    if (!this.treeDirty && this.spanningTree.size > 0) return;

    const peerIds = [this.myPeerId, ...Array.from(this.peers.keys())];
    if (peerIds.length <= 1) return;

    const edges: Array<[string, string, number]> = [];
    for (let i = 0; i < peerIds.length; i++) {
      for (let j = i + 1; j < peerIds.length; j++) {
        const a = peerIds[i];
        const b = peerIds[j];
        const latency =
          (i === 0 ? 0 : this.latencies.get(a) ?? 100) +
          (j === 0 ? 0 : this.latencies.get(b) ?? 100);
        edges.push([a, b, latency]);
      }
    }

    edges.sort((a, b) => a[2] - b[2]);

    const parent = new Map<string, string>();
    for (const id of peerIds) parent.set(id, id);

    const find = (x: string): string => {
      if (parent.get(x) !== x) {
        parent.set(x, find(parent.get(x)!));
      }
      return parent.get(x)!;
    };

    const union = (x: string, y: string): boolean => {
      const rx = find(x);
      const ry = find(y);
      if (rx === ry) return false;
      parent.set(rx, ry);
      return true;
    };

    const treeAdj = new Map<string, string[]>();
    for (const id of peerIds) treeAdj.set(id, []);

    for (const [a, b] of edges) {
      if (union(a, b)) {
        treeAdj.get(a)!.push(b);
        treeAdj.get(b)!.push(a);
      }
    }

    this.spanningTree = treeAdj;
    this.treeDirty = false;
  }
}
