"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ingestFrame } from "@/utils/telemetry/dataStore";
import { TelemetryDataStore } from "@/utils/telemetry/dataStore";
import { FrameValidator } from "@/utils/telemetry/frameValidator";
import { parseFrame } from "@/utils/telemetry/binaryFraming";
import { MAX_CHART_POINTS } from "@/utils/telemetry/types";

/** Minimal socket surface the hook depends on (subset of the DOM WebSocket). */
export interface SocketLike {
  binaryType?: string;
  readyState: number;
  send(data: string | ArrayBuffer): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: Event) => void) | null;
  onmessage: ((ev: MessageEvent) => void) | null;
  onclose: ((ev: CloseEvent) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export type StreamStatus = "idle" | "connecting" | "open" | "closed" | "error";

export interface UseTelemetryStreamOptions {
  url: string;
  /** Number of telemetry series per frame. @default 1 */
  seriesCount?: number;
  /** Max points retained per series. @default 10_000 */
  maxPoints?: number;
  /** Start/stop the stream. @default true */
  enabled?: boolean;
  /** Auto-reconnect after the socket closes. @default true */
  autoReconnect?: boolean;
  /** Base delay between reconnect attempts (ms). @default 1000 */
  reconnectDelayMs?: number;
  /** Injectable transport (defaults to the browser WebSocket). */
  createSocket?: SocketFactory;
}

export interface UseTelemetryStreamResult {
  /** Mutable data store the chart reads from (stable identity). */
  store: TelemetryDataStore;
  status: StreamStatus;
  /** Current connection epoch id (changes on every reconnect). */
  connectionId: string | null;
  reconnectCount: number;
  connect: () => void;
  disconnect: () => void;
}

const DEFAULT_RECONNECT_DELAY_MS = 1000;

function createDefaultSocket(url: string): SocketLike {
  if (typeof WebSocket === "undefined") {
    throw new Error("WebSocket is not available in this environment");
  }
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  return ws as unknown as SocketLike;
}

/**
 * Subscribes to a binary telemetry stream and pushes validated points into a
 * {@link TelemetryDataStore}. Reconnects are handled transparently; on every
 * `onopen` the validator begins a new epoch so a counter reset (common in
 * mobile DePIN deployments) never floods the chart with synthetic points.
 */
export function useTelemetryStream(
  options: UseTelemetryStreamOptions
): UseTelemetryStreamResult {
  const {
    url,
    seriesCount = 1,
    maxPoints = MAX_CHART_POINTS,
    enabled = true,
    autoReconnect = true,
    reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
    createSocket = createDefaultSocket,
  } = options;

  const [status, setStatus] = useState<StreamStatus>("idle");
  const [connectionId, setConnectionId] = useState<string | null>(null);
  const [reconnectCount, setReconnectCount] = useState(0);

  const seriesCountRef = useRef(seriesCount);
  seriesCountRef.current = seriesCount;

  // Lazily-initialized singletons (stable across renders).
  const storeRef = useRef<TelemetryDataStore | null>(null);
  if (storeRef.current === null) {
    storeRef.current = new TelemetryDataStore(seriesCount, maxPoints);
  }
  const validatorRef = useRef<FrameValidator | null>(null);
  if (validatorRef.current === null) {
    validatorRef.current = new FrameValidator();
  }
  const store = storeRef.current;
  const prevValuesRef = useRef<number[]>(Array.from({ length: seriesCount }, () => NaN));

  const socketRef = useRef<SocketLike | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualCloseRef = useRef(false);
  const hadFirstConnectionRef = useRef(false);
  const openRef = useRef<() => void>(() => {});

  const ingest = useCallback((data: ArrayBuffer) => {
    const validator = validatorRef.current;
    const store = storeRef.current;
    if (!validator || !store) return;
    let frame;
    try {
      frame = parseFrame(data, seriesCountRef.current);
    } catch {
      return;
    }
    ingestFrame(validator, store, prevValuesRef.current, frame);
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    manualCloseRef.current = true;
    clearReconnectTimer();
    const socket = socketRef.current;
    if (socket) {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      socketRef.current = null;
    }
    setStatus("closed");
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    manualCloseRef.current = false;
    openRef.current();
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("idle");
      return;
    }
    let disposed = false;

    const scheduleReconnect = () => {
      if (disposed || manualCloseRef.current || !autoReconnect) return;
      clearReconnectTimer();
      reconnectTimerRef.current = setTimeout(() => {
        if (!disposed && !manualCloseRef.current) open();
      }, reconnectDelayMs);
    };

    const open = () => {
      if (disposed) return;
      setStatus("connecting");
      let socket: SocketLike;
      try {
        socket = createSocket(url);
      } catch {
        if (!disposed) setStatus("error");
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        if (disposed) return;
        const validator = validatorRef.current;
        if (validator) {
          const id = validator.beginEpoch();
          // Clear per-series predecessor values: the new stream's first frame
          // has no valid predecessor to interpolate against.
          for (let s = 0; s < prevValuesRef.current.length; s++) {
            prevValuesRef.current[s] = NaN;
          }
          setConnectionId(id);
        }
        if (hadFirstConnectionRef.current) {
          setReconnectCount((c) => c + 1);
        }
        hadFirstConnectionRef.current = true;
        setStatus("open");
      };

      socket.onmessage = (ev: MessageEvent) => {
        if (disposed) return;
        const data = ev.data;
        if (!(data instanceof ArrayBuffer)) return;
        ingest(data);
      };

      socket.onclose = () => {
        if (disposed) return;
        socketRef.current = null;
        setStatus("closed");
        scheduleReconnect();
      };

      socket.onerror = () => {
        if (!disposed) setStatus("error");
      };
    };

    openRef.current = open;
    open();

    return () => {
      disposed = true;
      clearReconnectTimer();
      manualCloseRef.current = true;
      const socket = socketRef.current;
      if (socket) {
        try {
          socket.close();
        } catch {
          /* ignore */
        }
        socketRef.current = null;
      }
      manualCloseRef.current = false;
    };
  }, [enabled, url, autoReconnect, reconnectDelayMs, createSocket, ingest, clearReconnectTimer]);

  return {
    store,
    status,
    connectionId,
    reconnectCount,
    connect,
    disconnect,
  };
}
