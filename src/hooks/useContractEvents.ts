"use client";

import { useEffect, useRef, useState, useCallback } from "react";

interface ContractEvent {
  topic: string;
  value: string;
  contractId: string;
  timestamp: number;
  block: number;
}

interface DecodedEvent {
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  raw: ContractEvent;
}

const eventDecoders: Record<string, (event: ContractEvent) => DecodedEvent> = {
  "meter_reading": (e) => ({
    type: "meter_reading",
    severity: "info",
    message: `Meter reading update: ${e.value}`,
    raw: e,
  }),
  "balance_low": (e) => ({
    type: "balance_low",
    severity: "warning",
    message: `Low balance alert for contract ${e.contractId.slice(0, 8)}...`,
    raw: e,
  }),
  "tariff_update": (e) => ({
    type: "tariff_update",
    severity: "info",
    message: `Tariff updated to ${e.value}`,
    raw: e,
  }),
  "unauthorized_access": (e) => ({
    type: "unauthorized_access",
    severity: "critical",
    message: `Unauthorized access attempt on ${e.contractId.slice(0, 8)}...`,
    raw: e,
  }),
  "device_fault": (e) => ({
    type: "device_fault",
    severity: "critical",
    message: `Device fault reported: ${e.value}`,
    raw: e,
  }),
};

function decodeEvent(event: ContractEvent): DecodedEvent {
  const decoder = eventDecoders[event.topic];
  if (decoder) return decoder(event);
  return {
    type: "unknown",
    severity: "info",
    message: `Unhandled event: ${event.topic}`,
    raw: event,
  };
}

export function useContractEvents(contractIds: string[]) {
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [latestBlock, setLatestBlock] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const ws = new WebSocket(
      `wss://testnet.futurenet.sorobanrpc.com?stream=events&contracts=${contractIds.join(",")}`
    );
    wsRef.current = ws;

    ws.onmessage = (msg) => {
      try {
        const raw: ContractEvent = JSON.parse(msg.data);
        setLatestBlock(raw.block);
        const decoded = decodeEvent(raw);
        setEvents((prev) => [decoded, ...prev].slice(0, 200));
      } catch {
        // skip malformed messages
      }
    };

    ws.onclose = () => {
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [contractIds]);

  useEffect(() => {
    if (contractIds.length === 0) return;
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect, contractIds]);

  return { events, latestBlock };
}
