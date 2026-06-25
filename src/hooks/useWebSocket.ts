"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SocketLike, SocketFactory } from "@/hooks/useTelemetryStream";
import {
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_TIMEOUT_MS,
  STICKY_NODE_STORAGE_KEY,
  type ConnectionStatus,
  type InboundControl,
  type RecoveryAck,
  type RecoveryFrame,
  type TelemetryFrame,
} from "@/types/connection";
import { ReconnectMachine } from "@/services/reconnectMachine";
import { FrameBuffer } from "@/utils/frameBuffer";
import { connectionStore } from "@/store/slices/connectionSlice";

type TimerId = ReturnType<typeof setTimeout>;

export interface UseWebSocketOptions {
  /** Base WebSocket URL; `?nodeId={sticky}` is appended automatically. */
  url: string;
  /** Start the connection. @default true */
  enabled?: boolean;
  /** Injectable transport (defaults to the browser WebSocket). */
  createSocket?: SocketFactory;
  /** Called for every inbound telemetry frame (live and backfilled). */
  onFrame?: (frame: TelemetryFrame) => void;
  /**
   * REST backfill for frames missed during the outage. Defaults to
   * `GET /ws/replay?from=&to=`. Injectable for tests.
   */
  replayFetch?: (from: number, to: number) => Promise<TelemetryFrame[]>;
  /** Injectable clock (ms). @default Date.now */
  now?: () => number;
  /** Injectable RNG for backoff jitter. @default Math.random */
  rng?: () => number;
  /** Injectable session storage for the sticky node id. */
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem">;
}

export interface UseWebSocketResult {
  status: ConnectionStatus;
  attempt: number;
  missedHeartbeats: number;
  nodeId: string | null;
  lastError: string | null;
  /** Send an application message over the socket (no-op if not open). */
  send: (data: unknown) => boolean;
  connect: () => void;
  disconnect: () => void;
}

function defaultReplayFetch(
  from: number,
  to: number
): Promise<TelemetryFrame[]> {
  return fetch(`/ws/replay?from=${from}&to=${to}`, {
    headers: { Accept: "application/json" },
  }).then((res) => {
    if (!res.ok) throw new Error(`Replay failed: HTTP ${res.status}`);
    return res.json() as Promise<TelemetryFrame[]>;
  });
}

function getDefaultStorage(): UseWebSocketOptions["storage"] | undefined {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : undefined;
  } catch {
    return undefined; // access can throw in sandboxed iframes
  }
}

function isControl(msg: unknown): msg is InboundControl {
  return (
    typeof msg === "object" &&
    msg !== null &&
    typeof (msg as { type?: unknown }).type === "string"
  );
}

/**
 * Persistent WebSocket with adaptive reconnection. Connection lifecycle is
 * delegated to {@link ReconnectMachine}; on entering `reconnecting` the hook
 * arms a full-jitter backoff timer, and on reconnect it runs a subscription
 * recovery handshake (replaying the buffered frames) before resuming. Status
 * transitions are mirrored into {@link connectionStore} for the UI.
 */
export function useWebSocket(options: UseWebSocketOptions): UseWebSocketResult {
  const {
    url,
    enabled = true,
    createSocket,
    onFrame,
    replayFetch = defaultReplayFetch,
    now = Date.now,
    rng = Math.random,
    storage = getDefaultStorage(),
  } = options;

  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [attempt, setAttempt] = useState(0);
  const [missedHeartbeats, setMissedHeartbeats] = useState(0);
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  // Stable singletons for the connection lifetime.
  const machineRef = useRef<ReconnectMachine | null>(null);
  if (machineRef.current === null) {
    machineRef.current = new ReconnectMachine({ rng });
  }
  const bufferRef = useRef<FrameBuffer | null>(null);
  if (bufferRef.current === null) {
    bufferRef.current = new FrameBuffer();
  }

  const socketRef = useRef<SocketLike | null>(null);
  const reconnectTimerRef = useRef<TimerId | null>(null);
  const heartbeatTimerRef = useRef<TimerId | null>(null);
  const lastPingAtRef = useRef<number>(0);
  const disposedRef = useRef(false);

  // Latest callbacks/config without re-subscribing the socket.
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;
  const createSocketRef = useRef(createSocket);
  createSocketRef.current = createSocket;
  const replayFetchRef = useRef(replayFetch);
  replayFetchRef.current = replayFetch;

  // ---- helpers ------------------------------------------------------------

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const clearHeartbeatTimer = useCallback(() => {
    if (heartbeatTimerRef.current !== null) {
      clearTimeout(heartbeatTimerRef.current);
      heartbeatTimerRef.current = null;
    }
  }, []);

  /** Mirror machine context into local state and the global store. */
  const syncFromMachine = useCallback(() => {
    const ctx = machineRef.current!.getContext();
    setStatus(ctx.status);
    setAttempt(ctx.attempt);
    setMissedHeartbeats(ctx.missedHeartbeats);
    setLastError(ctx.lastError);
    if (ctx.status === "failed") {
      connectionStore.dispatch({
        type: "CONNECTION_FAILED",
        payload: { error: ctx.lastError ?? "Connection failed" },
      });
    } else {
      connectionStore.dispatch({
        type: "CONNECTION_STATUS_CHANGED",
        payload: {
          status: ctx.status,
          attempt: ctx.attempt,
          nextDelayMs: ctx.nextDelayMs,
        },
      });
    }
  }, []);

  const buildUrl = useCallback((): string => {
    const sticky = storage?.getItem(STICKY_NODE_STORAGE_KEY) ?? "";
    const sep = url.includes("?") ? "&" : "?";
    return sticky ? `${url}${sep}nodeId=${encodeURIComponent(sticky)}` : url;
  }, [storage, url]);

  // Forward declaration so the close handler can re-open.
  const openRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    const ctx = machineRef.current!.getContext();
    if (ctx.status !== "reconnecting" || ctx.nextDelayMs === null) return;
    clearReconnectTimer();
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      if (disposedRef.current) return;
      machineRef.current!.send({ type: "RETRY" });
      syncFromMachine();
      openRef.current();
    }, ctx.nextDelayMs);
  }, [clearReconnectTimer, syncFromMachine]);

  const handleDisconnect = useCallback(() => {
    if (disposedRef.current) return;
    clearHeartbeatTimer();
    socketRef.current = null;
    machineRef.current!.send({ type: "DISCONNECTED" });
    syncFromMachine();
    if (machineRef.current!.getContext().status === "reconnecting") {
      scheduleReconnect();
    }
  }, [clearHeartbeatTimer, scheduleReconnect, syncFromMachine]);

  /** Arm the heartbeat watchdog: a missed server ping marks the link dead. */
  const armHeartbeat = useCallback(() => {
    clearHeartbeatTimer();
    heartbeatTimerRef.current = setTimeout(() => {
      if (disposedRef.current) return;
      const missed = machineRef.current!.recordMissedHeartbeat();
      connectionStore.dispatch({
        type: "HEARTBEAT_MISSED",
        payload: { missedHeartbeats: missed },
      });
      setMissedHeartbeats(missed);
      machineRef.current!.send({ type: "HEARTBEAT_TIMEOUT" });
      syncFromMachine();
      try {
        socketRef.current?.close();
      } catch {
        /* ignore */
      }
      handleDisconnect();
    }, HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS);
  }, [clearHeartbeatTimer, handleDisconnect, syncFromMachine]);

  const handlePing = useCallback(() => {
    const t = now();
    const prev = lastPingAtRef.current;
    lastPingAtRef.current = t;
    // Inter-ping drift beyond the nominal interval is reported as latency.
    if (prev > 0) {
      const latency = Math.max(0, t - prev - HEARTBEAT_INTERVAL_MS);
      connectionStore.dispatch({ type: "HEARTBEAT_LATENCY", payload: { latency } });
    }
    try {
      socketRef.current?.send(JSON.stringify({ type: "pong" }));
    } catch {
      /* ignore */
    }
    armHeartbeat();
  }, [armHeartbeat, now]);

  const sendRecovery = useCallback(() => {
    const buffer = bufferRef.current!;
    const sticky = storage?.getItem(STICKY_NODE_STORAGE_KEY) ?? null;
    const frame: RecoveryFrame = {
      type: "recovery",
      lastSequenceId: buffer.lastSequenceId,
      nodeId: sticky,
      frames: buffer.drain(),
    };
    try {
      socketRef.current?.send(JSON.stringify(frame));
    } catch {
      /* ignore */
    }
  }, [storage]);

  const handleRecoveryAck = useCallback(
    async (ack: RecoveryAck) => {
      const buffer = bufferRef.current!;
      const fromSeq = buffer.lastSequenceId;

      machineRef.current!.send({ type: "RECOVERY_SUCCESS" });
      syncFromMachine();
      connectionStore.dispatch({ type: "CONNECTION_RECOVERED" });
      armHeartbeat();

      // Backfill anything the buffer could not cover via the REST replay API.
      if (ack.missedCount > 0 && ack.serverCurrentSeq > fromSeq) {
        try {
          const missed = await replayFetchRef.current(fromSeq, ack.serverCurrentSeq);
          if (disposedRef.current) return;
          for (const f of missed) {
            buffer.push(f);
            onFrameRef.current?.(f);
          }
        } catch {
          // Backfill is best-effort; the live stream continues regardless.
        }
      }
    },
    [armHeartbeat, syncFromMachine]
  );

  const handleMessage = useCallback(
    (raw: unknown) => {
      let msg: unknown = raw;
      if (typeof raw === "string") {
        try {
          msg = JSON.parse(raw);
        } catch {
          return; // ignore non-JSON text frames
        }
      }

      if (isControl(msg)) {
        switch (msg.type) {
          case "ping":
            handlePing();
            return;
          case "node_assigned":
            storage?.setItem(STICKY_NODE_STORAGE_KEY, msg.nodeId);
            setNodeId(msg.nodeId);
            connectionStore.dispatch({
              type: "NODE_ID_ASSIGNED",
              payload: { nodeId: msg.nodeId },
            });
            return;
          case "recovery_ack":
            void handleRecoveryAck(msg);
            return;
        }
      }

      // Otherwise treat it as a telemetry frame and buffer it for replay.
      if (
        typeof msg === "object" &&
        msg !== null &&
        typeof (msg as { sequenceId?: unknown }).sequenceId === "number"
      ) {
        const frame = msg as TelemetryFrame;
        bufferRef.current!.push(frame);
        onFrameRef.current?.(frame);
      }
    },
    [handlePing, handleRecoveryAck, storage]
  );

  const open = useCallback(() => {
    if (disposedRef.current) return;
    let socket: SocketLike;
    try {
      const factory = createSocketRef.current;
      if (!factory) throw new Error("No socket factory provided");
      socket = factory(buildUrl());
    } catch (err) {
      machineRef.current!.send({ type: "DISCONNECTED" });
      setLastError((err as Error).message);
      syncFromMachine();
      if (machineRef.current!.getContext().status === "reconnecting") {
        scheduleReconnect();
      }
      return;
    }
    socketRef.current = socket;

    socket.onopen = () => {
      if (disposedRef.current) return;
      machineRef.current!.send({ type: "CONNECTED" });
      syncFromMachine();
      const ctx = machineRef.current!.getContext();
      if (ctx.status === "recovering") {
        sendRecovery();
      } else {
        armHeartbeat();
      }
    };
    socket.onmessage = (ev: MessageEvent) => {
      if (disposedRef.current) return;
      handleMessage(ev.data);
    };
    socket.onclose = () => handleDisconnect();
    socket.onerror = () => handleDisconnect();
  }, [
    armHeartbeat,
    buildUrl,
    handleDisconnect,
    handleMessage,
    scheduleReconnect,
    sendRecovery,
    syncFromMachine,
  ]);
  openRef.current = open;

  // ---- public API ---------------------------------------------------------

  const connect = useCallback(() => {
    if (disposedRef.current) return;
    machineRef.current!.send({ type: "CONNECT" });
    syncFromMachine();
    open();
  }, [open, syncFromMachine]);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    clearHeartbeatTimer();
    machineRef.current!.send({ type: "RESET" });
    syncFromMachine();
    connectionStore.dispatch({ type: "RESET" });
    const socket = socketRef.current;
    socketRef.current = null;
    if (socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
    }
  }, [clearHeartbeatTimer, clearReconnectTimer, syncFromMachine]);

  const send = useCallback((data: unknown): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== 1 /* OPEN */) return false;
    try {
      socket.send(typeof data === "string" ? data : JSON.stringify(data));
      return true;
    } catch {
      return false;
    }
  }, []);

  // ---- lifecycle ----------------------------------------------------------

  useEffect(() => {
    if (!enabled) return;
    disposedRef.current = false;
    connect();
    return () => {
      disposedRef.current = true;
      clearReconnectTimer();
      clearHeartbeatTimer();
      const socket = socketRef.current;
      socketRef.current = null;
      if (socket) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
      }
    };
    // Intentionally only (re)run when enabled/url changes; callbacks use refs.
  }, [enabled, url]);

  return {
    status,
    attempt,
    missedHeartbeats,
    nodeId,
    lastError,
    send,
    connect,
    disconnect,
  };
}
