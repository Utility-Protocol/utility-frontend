'use client';

import { useEffect, useRef, useState } from 'react';

import type { MeterReading, WebSocketPayload } from '@/types';

const RECONNECT_DELAY_MS = 3000;

export interface TelemetryStreamState {
  isConnected: boolean;
  latestReading: MeterReading | null;
  error: string | null;
}

export function useTelemetryStream(): TelemetryStreamState {
  const [isConnected, setIsConnected] = useState(false);
  const [latestReading, setLatestReading] = useState<MeterReading | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const wsUrl = process.env.NEXT_PUBLIC_BACKEND_WS_URL;

    function connect(): void {
      if (cancelled || !wsUrl) return;

      let socket: WebSocket;
      try {
        socket = new WebSocket(wsUrl);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to open WebSocket');
        scheduleReconnect();
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      socket.onmessage = (event) => {
        let payload: WebSocketPayload;
        try {
          payload = JSON.parse(String(event.data)) as WebSocketPayload;
        } catch {
          return;
        }
        if (payload?.type === 'METER_READING') {
          setLatestReading(payload.data);
        }
      };

      socket.onerror = () => {
        setError('Telemetry stream error');
      };

      socket.onclose = () => {
        setIsConnected(false);
        socketRef.current = null;
        scheduleReconnect();
      };
    }

    function scheduleReconnect(): void {
      if (cancelled) return;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  return { isConnected, latestReading, error };
}