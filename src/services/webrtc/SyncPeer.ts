/**
 * SyncPeer — manages a single WebRTC peer connection.
 *
 * Handles RTCPeerConnection lifecycle, SCTP data channel setup,
 * message framing, and reconnection with exponential backoff.
 * Exposes SDP offers/answers and ICE candidates to the parent
 * via event handlers for relaying through the signaling layer.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SyncEntry {
  id: string;
  resourceType: string;
  action: "create" | "update" | "delete";
  data: unknown;
  timestamp: number;
  peerId: string;
  vectorClock: Record<string, number>;
}

export interface SyncMessage {
  type: "sync-batch";
  entries: SyncEntry[];
  senderPeerId: string;
}

export type PeerEvent =
  | { type: "connected"; peerId: string }
  | { type: "disconnected"; peerId: string }
  | { type: "data"; peerId: string; entries: SyncEntry[] }
  | { type: "error"; peerId: string; message: string }
  | { type: "sdp-ready"; sdp: string; peerId: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit; peerId: string };

export type PeerEventHandler = (event: PeerEvent) => void;

/** SCTP data channels in browsers are limited to ~16 KB per message. */
const MAX_MESSAGE_SIZE = 14 * 1024; // 14 KB (safe margin)
const DATA_CHANNEL_LABEL = "utility-sync";
const RECONNECT_BASE_DELAY_MS = 1_000;
const RECONNECT_MAX_DELAY_MS = 30_000;

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SyncPeerConfig {
  peerId: string;
  iceServers?: RTCIceServer[];
  /** If true, this peer initiates the connection (creates the offer). */
  isInitiator?: boolean;
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
];

// ---------------------------------------------------------------------------
// SyncPeer
// ---------------------------------------------------------------------------

export class SyncPeer {
  readonly peerId: string;
  private pc: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private handler: PeerEventHandler | null = null;
  private isInitiator: boolean;
  private iceServers: RTCIceServer[];
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor(config: SyncPeerConfig) {
    this.peerId = config.peerId;
    this.isInitiator = config.isInitiator ?? false;
    this.iceServers = config.iceServers ?? DEFAULT_ICE_SERVERS;
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  onEvent(handler: PeerEventHandler): void {
    this.handler = handler;
  }

  /** Start the connection (creates RTCPeerConnection). */
  async connect(): Promise<void> {
    if (this.destroyed || this.pc) return;
    this.createPeerConnection();
    this.createDataChannel();

    if (this.isInitiator) {
      await this.createAndSendOffer();
    }
  }

  /** Process a remote SDP offer and return our answer SDP. */
  async handleOffer(sdp: string): Promise<string | null> {
    if (!this.pc) {
      this.createPeerConnection();
      this.createDataChannel();
    }

    // After createPeerConnection(), this.pc is guaranteed non-null
    const pc = this.pc!;

    await pc.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp })
    );

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return pc.localDescription?.sdp ?? null;
  }

  /** Process a remote SDP answer. */
  async handleAnswer(sdp: string): Promise<void> {
    if (!this.pc) return;
    await this.pc.setRemoteDescription(
      new RTCSessionDescription({ type: "answer", sdp })
    );
  }

  /** Add a remote ICE candidate. */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;
    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  /** Send a batch of sync entries through the data channel. */
  send(entries: SyncEntry[]): void {
    if (!this.dataChannel || this.dataChannel.readyState !== "open") return;

    const message: SyncMessage = {
      type: "sync-batch",
      entries,
      senderPeerId: this.peerId,
    };

    let payload = JSON.stringify(message);

    // Split into chunks respecting SCTP message limits
    while (payload.length > 0) {
      const chunk = payload.slice(0, MAX_MESSAGE_SIZE);
      payload = payload.slice(MAX_MESSAGE_SIZE);
      this.dataChannel.send(chunk);
    }
  }

  /** Gracefully close the connection. */
  close(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.dataChannel?.close();
    this.pc?.close();
    this.pc = null;
    this.dataChannel = null;
    this.emit({ type: "disconnected", peerId: this.peerId });
  }

  /** Whether the peer is currently connected. */
  get isConnected(): boolean {
    return (
      this.pc?.connectionState === "connected" &&
      this.dataChannel?.readyState === "open"
    );
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private createPeerConnection(): void {
    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });

    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === "connected") {
        this.reconnectAttempts = 0;
        this.clearReconnectTimer();
      } else if (
        this.pc?.connectionState === "disconnected" ||
        this.pc?.connectionState === "failed"
      ) {
        this.scheduleReconnect();
      }
    };

    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit({
          type: "ice-candidate",
          peerId: this.peerId,
          candidate: event.candidate.toJSON(),
        });
      }
    };

    this.pc.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel();
    };
  }

  private createDataChannel(): void {
    if (!this.pc) return;
    this.dataChannel = this.pc.createDataChannel(DATA_CHANNEL_LABEL, {
      ordered: true,
    });
    this.setupDataChannel();
  }

  private setupDataChannel(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      this.emit({ type: "connected", peerId: this.peerId });
    };

    this.dataChannel.onclose = () => {
      this.emit({ type: "disconnected", peerId: this.peerId });
    };

    this.dataChannel.onmessage = (event) => {
      try {
        const parsed: SyncMessage = JSON.parse(event.data as string);
        if (parsed.type === "sync-batch") {
          this.emit({
            type: "data",
            peerId: parsed.senderPeerId,
            entries: parsed.entries,
          });
        }
      } catch (err) {
        this.emit({
          type: "error",
          peerId: this.peerId,
          message: `Failed to parse message: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    };
  }

  private async createAndSendOffer(): Promise<void> {
    if (!this.pc) return;
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    // Emit the SDP so the parent can relay it via signaling
    if (this.pc.localDescription?.sdp) {
      this.emit({
        type: "sdp-ready",
        sdp: this.pc.localDescription.sdp,
        peerId: this.peerId,
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();

    const delay = Math.min(
      RECONNECT_BASE_DELAY_MS * 2 ** this.reconnectAttempts,
      RECONNECT_MAX_DELAY_MS
    );

    this.reconnectTimer = setTimeout(() => {
      if (this.destroyed) return;
      this.reconnectAttempts++;
      this.pc?.close();
      this.createPeerConnection();
      this.createDataChannel();
      if (this.isInitiator) {
        void this.createAndSendOffer();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private emit(event: PeerEvent): void {
    this.handler?.(event);
  }
}
