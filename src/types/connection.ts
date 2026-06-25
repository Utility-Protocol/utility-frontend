/**
 * Types and invariants for the adaptive WebSocket reconnection stratum.
 *
 * The dashboard holds a persistent WebSocket to a load-balanced backend. On
 * disconnect the client reconnects with capped exponential backoff + full
 * jitter, reattaches to its sticky backend node, and replays buffered telemetry
 * so the operator sees at most ~3 s of data loss during a failure cascade.
 */

// --- Backoff invariants -----------------------------------------------------

/** Initial backoff in milliseconds. */
export const INITIAL_BACKOFF_MS = 500;
/** Maximum backoff ceiling in milliseconds. */
export const MAX_BACKOFF_MS = 30_000;
/** Exponential multiplier (base ^ attempt). */
export const BACKOFF_MULTIPLIER = 2;
/** Attempts before declaring terminal failure (~3.5 min of reconnection). */
export const MAX_RECONNECT_ATTEMPTS = 12;

// --- Heartbeat invariants ---------------------------------------------------

/** Server sends "ping" on this cadence (ms). */
export const HEARTBEAT_INTERVAL_MS = 15_000;
/** Client must answer "pong" within this window or the link is dead (ms). */
export const HEARTBEAT_TIMEOUT_MS = 5_000;

// --- Frame buffer invariants ------------------------------------------------

/** Telemetry frames retained for replay during recovery. */
export const FRAME_BUFFER_CAPACITY = 500;

// --- Sticky session ---------------------------------------------------------

/** sessionStorage key holding the server-assigned sticky node id. */
export const STICKY_NODE_STORAGE_KEY = "ws:stickyNodeId";

// --- Connection state -------------------------------------------------------

/** Finite states of the reconnection machine. */
export type ConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "recovering"
  | "failed";

/** Coarse link quality surfaced to the UI (green / yellow / red). */
export type ConnectionQuality = "good" | "degraded" | "down";

/** Events that drive the reconnection machine. */
export type ReconnectEvent =
  | { type: "CONNECT" }
  | { type: "CONNECTED" }
  | { type: "DISCONNECTED" }
  | { type: "HEARTBEAT_TIMEOUT" }
  | { type: "RETRY" }
  | { type: "RECOVERY_SUCCESS" }
  | { type: "RESET" };

/** Immutable snapshot of the machine's context. */
export interface ReconnectContext {
  status: ConnectionStatus;
  /** Number of reconnection attempts made in the current outage (0 when healthy). */
  attempt: number;
  /** Consecutive missed heartbeats. */
  missedHeartbeats: number;
  /** Delay (ms) scheduled before the next reconnect attempt, if any. */
  nextDelayMs: number | null;
  lastError: string | null;
}

// --- Telemetry frames (replay) ---------------------------------------------

/**
 * A buffered telemetry frame. The payload is opaque to the reconnection layer;
 * each frame is tagged with a monotonic sequence id so the server can compute
 * how many frames the client missed during the outage.
 */
export interface TelemetryFrame {
  /** Monotonic, server-assigned sequence id. */
  sequenceId: number;
  /** Opaque payload (200 bytes – 100 KB). */
  data: unknown;
  /** Wall-clock ms when received. */
  receivedAt: number;
  /** Approximate byte size, used for buffer accounting. */
  size: number;
}

/** Recovery handshake the client sends on reconnect. */
export interface RecoveryFrame {
  type: "recovery";
  /** Highest sequence id the client has seen. */
  lastSequenceId: number;
  /** Sticky node id the client wants to reattach to. */
  nodeId: string | null;
  /** Buffered frames replayed to the server as a batch. */
  frames: TelemetryFrame[];
}

/** Server acknowledgement of a recovery handshake. */
export interface RecoveryAck {
  type: "recovery_ack";
  /** Number of frames the client missed while disconnected. */
  missedCount: number;
  /** Server's current highest sequence id (used to bound a REST backfill). */
  serverCurrentSeq: number;
  /** Node id the server bound this session to (may differ from requested). */
  nodeId?: string;
}

/** Inbound control/heartbeat messages. */
export type InboundControl =
  | { type: "ping" }
  | { type: "node_assigned"; nodeId: string }
  | RecoveryAck;
