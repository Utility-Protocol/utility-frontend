'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UtilTickData {
  event_id: string;
  consumer: string;
  operator: string;
  resource_type: string;
  units_drawn: number;
  cost: string;
  meter_sequence: number;
  timestamp: number;
}

export interface UtilTickMessage {
  type: 'UTIL_TICK';
  data: UtilTickData;
}

export interface UseGridTelemetryOptions {
  url?: string;
  filterConsumer?: string;
  filterOperator?: string;
  maxHistory?: number;
  autoReconnect?: boolean;
  baseReconnectDelay?: number;
  maxReconnectDelay?: number;
}

export interface UseGridTelemetryReturn {
  isConnected: boolean;
  isConnecting: boolean;
  error: Event | Error | null;
  latestTick: UtilTickData | null;
  ticks: UtilTickData[];
  clearHistory: () => void;
  reconnect: () => void;
}

export function useGridTelemetry({
  url = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4000/stream/ticks',
  filterConsumer,
  filterOperator,
  maxHistory = 50,
  autoReconnect = true,
  baseReconnectDelay = 1000,
  maxReconnectDelay = 15000,
}: UseGridTelemetryOptions = {}): UseGridTelemetryReturn {
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [error, setError] = useState<Event | Error | null>(null);
  const [latestTick, setLatestTick] = useState<UtilTickData | null>(null);
  const [ticks, setTicks] = useState<UtilTickData[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  // Browser timer handle; `NodeJS.Timeout` is not available without @types/node
  // leaking into the client bundle.
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const shouldConnectRef = useRef<boolean>(true);

  const clearHistory = useCallback(() => {
    setTicks([]);
    setLatestTick(null);
  }, []);

  const connect = useCallback(() => {
    if (typeof window === 'undefined') return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Detach handlers before closing so teardown does not schedule a reconnect.
    if (wsRef.current) {
      wsRef.current.onopen = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnecting(true);
    setError(null);

    try {
      const socket = new WebSocket(url);
      wsRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        setIsConnecting(false);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      socket.onmessage = (event: MessageEvent) => {
        try {
          const parsed: UtilTickMessage = JSON.parse(event.data);

          if (parsed.type === 'UTIL_TICK' && parsed.data) {
            const tick = parsed.data;

            if (filterConsumer && tick.consumer.toLowerCase() !== filterConsumer.toLowerCase()) {
              return;
            }
            if (filterOperator && tick.operator.toLowerCase() !== filterOperator.toLowerCase()) {
              return;
            }

            setLatestTick(tick);
            setTicks((prev) => {
              // De-duplicate on event_id: the socket can re-deliver on reconnect.
              if (prev.some((t) => t.event_id === tick.event_id)) return prev;
              return [tick, ...prev].slice(0, maxHistory);
            });
          }
        } catch (err) {
          console.warn('[useGridTelemetry] Malformed WS frame received:', event.data);
        }
      };

      socket.onerror = (evt) => {
        setError(evt);
      };

      socket.onclose = () => {
        setIsConnected(false);
        setIsConnecting(false);

        if (shouldConnectRef.current && autoReconnect) {
          const attempt = reconnectAttemptsRef.current;
          const delay = Math.min(
            baseReconnectDelay * Math.pow(1.5, attempt) + Math.random() * 500,
            maxReconnectDelay
          );
          reconnectAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };
    } catch (err) {
      setIsConnecting(false);
      setError(err instanceof Error ? err : new Error(String(err)));
    }
  }, [
    url,
    filterConsumer,
    filterOperator,
    maxHistory,
    autoReconnect,
    baseReconnectDelay,
    maxReconnectDelay,
  ]);

  const reconnect = useCallback(() => {
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  useEffect(() => {
    shouldConnectRef.current = true;
    connect();

    return () => {
      shouldConnectRef.current = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    isConnecting,
    error,
    latestTick,
    ticks,
    clearHistory,
    reconnect,
  };
}