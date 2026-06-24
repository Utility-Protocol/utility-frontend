/**
 * SignalingClient — WebSocket-based signaling for WebRTC mesh.
 *
 * Connects to a signaling server at wss://signal.utilityprotocol.com
 * and exchanges SDP offers/answers and ICE candidates between peers
 * in a given room.
 */

import { resolveSorobanError } from "@/utils/errors";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SignalingMessage {
  type:
    | "join"
    | "leave"
    | "offer"
    | "answer"
    | "ice-candidate"
    | "peer-joined"
    | "peer-left"
    | "error";
  roomId?: string;
  peerId?: string;
  sdp?: string;
  candidate?: RTCIceCandidateInit;
  message?: string;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export interface SignalingConfig {
  serverUrl: string;
  roomId: string;
  peerId: string;
  /** Reconnect delay in ms (exponential backoff to this maximum). */
  reconnectMaxDelayMs?: number;
}

const DEFAULT_SERVER_URL = "wss://signal.utilityprotocol.com";
const DEFAULT_RECONNECT_MAX_MS = 30_000;

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type SignalingEvent =
  | { type: "connected" }
  | { type: "disconnected"; reason: string }
  | { type: "peer-joined"; peerId: string }
  | { type: "peer-left"; peerId: string }
  | { type: "offer"; from: string; sdp: string }
  | { type: "answer"; from: string; sdp: string }
  | { type: "ice-candidate"; from: string; candidate: RTCIceCandidateInit }
  | { type: "error"; message: string };

export type SignalingEventHandler = (event: SignalingEvent) => void;

// ---------------------------------------------------------------------------
// SignalingClient
// ---------------------------------------------------------------------------

export class SignalingClient {
  private ws: WebSocket | null = null;
  private config: SignalingConfig;
  private handler: SignalingEventHandler | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private joined = false;

  constructor(config: SignalingConfig) {
    this.config = {
      ...config,
      serverUrl: config.serverUrl || DEFAULT_SERVER_URL,
      reconnectMaxDelayMs:
        config.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_MS,
    };
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------

  onEvent(handler: SignalingEventHandler): void {
    this.handler = handler;
  }

  /** Open the WebSocket connection and join the room. */
  connect(): void {
    if (this.destroyed) return;
    this.createSocket();
  }

  /** Send an SDP offer to a specific peer. */
  sendOffer(targetPeerId: string, sdp: string): void {
    this.send({
      type: "offer",
      peerId: this.config.peerId,
      sdp,
      roomId: this.config.roomId,
    });
  }

  /** Send an SDP answer to a specific peer. */
  sendAnswer(targetPeerId: string, sdp: string): void {
    this.send({
      type: "answer",
      peerId: this.config.peerId,
      sdp,
      roomId: this.config.roomId,
    });
  }

  /** Send an ICE candidate to a specific peer. */
  sendIceCandidate(
    targetPeerId: string,
    candidate: RTCIceCandidateInit
  ): void {
    this.send({
      type: "ice-candidate",
      peerId: this.config.peerId,
      candidate,
      roomId: this.config.roomId,
    });
  }

  /** Close the connection and leave the room. */
  disconnect(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.joined = false;
    if (this.ws) {
      this.send({ type: "leave", peerId: this.config.peerId });
      this.ws.close();
      this.ws = null;
    }
  }

  // ------------------------------------------------------------------
  // Internal
  // ------------------------------------------------------------------

  private createSocket(): void {
    this.ws = new WebSocket(this.config.serverUrl);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.send({
        type: "join",
        roomId: this.config.roomId,
        peerId: this.config.peerId,
      });
      this.joined = true;
      this.handler?.({ type: "connected" });
    };

    this.ws.onclose = () => {
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      this.handler?.({
        type: "error",
        message: "WebSocket connection error",
      });
    };

    this.ws.onmessage = (event) => {
      try {
        const msg: SignalingMessage = JSON.parse(event.data as string);
        this.handleMessage(msg);
      } catch {
        this.handler?.({
          type: "error",
          message: "Failed to parse signaling message",
        });
      }
    };
  }

  private handleMessage(msg: SignalingMessage): void {
    const from = msg.peerId ?? "unknown";

    switch (msg.type) {
      case "peer-joined":
        this.handler?.({ type: "peer-joined", peerId: from });
        break;
      case "peer-left":
        this.handler?.({ type: "peer-left", peerId: from });
        break;
      case "offer":
        this.handler?.({ type: "offer", from, sdp: msg.sdp ?? "" });
        break;
      case "answer":
        this.handler?.({ type: "answer", from, sdp: msg.sdp ?? "" });
        break;
      case "ice-candidate":
        if (msg.candidate) {
          this.handler?.({
            type: "ice-candidate",
            from,
            candidate: msg.candidate,
          });
        }
        break;
      case "error":
        this.handler?.({
          type: "error",
          message: resolveSorobanError(msg.message ?? "Signaling error"),
        });
        break;
    }
  }

  private send(msg: SignalingMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    const maxDelay = this.config.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_MS;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, maxDelay);
    this.reconnectAttempts++;

    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this.createSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
}
