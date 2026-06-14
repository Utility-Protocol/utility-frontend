"use client";

import { useState, useCallback, useRef, useEffect } from "react";

interface QueuedTransaction {
  id: string;
  txHash: string | null;
  status: "pending" | "submitted" | "confirmed" | "failed";
  retryCount: number;
  maxRetries: number;
  error: string | null;
  createdAt: number;
}

interface UseRetryQueueReturn {
  queue: QueuedTransaction[];
  enqueue: (id: string, maxRetries?: number) => void;
  updateTxHash: (id: string, txHash: string) => void;
  markConfirmed: (id: string) => void;
  markFailed: (id: string, error: string) => void;
  retry: (id: string) => Promise<void>;
  purge: () => void;
  pendingCount: number;
}

const RETRY_DELAYS = [1000, 5000, 15000, 30000, 60000];

export function useRetryQueue(): UseRetryQueueReturn {
  const [queue, setQueue] = useState<QueuedTransaction[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const cleanupTimer = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const enqueue = useCallback((id: string, maxRetries = 5) => {
    setQueue((prev) => {
      if (prev.find((t) => t.id === id)) return prev;
      return [
        {
          id,
          txHash: null,
          status: "pending",
          retryCount: 0,
          maxRetries,
          error: null,
          createdAt: Date.now(),
        },
        ...prev,
      ];
    });
  }, []);

  const updateTxHash = useCallback((id: string, txHash: string) => {
    setQueue((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, txHash, status: "submitted" as const } : t
      )
    );
  }, []);

  const markConfirmed = useCallback(
    (id: string) => {
      cleanupTimer(id);
      setQueue((prev) =>
        prev.map((t) =>
          t.id === id ? { ...t, status: "confirmed" as const } : t
        )
      );
    },
    [cleanupTimer]
  );

  const markFailed = useCallback(
    (id: string, error: string) => {
      const tx = queue.find((t) => t.id === id);
      if (!tx) return;
      if (tx.retryCount < tx.maxRetries) {
        const delay =
          RETRY_DELAYS[Math.min(tx.retryCount, RETRY_DELAYS.length - 1)];
        const timer = setTimeout(() => {
          setQueue((prev) =>
            prev.map((t) =>
              t.id === id
                ? { ...t, retryCount: t.retryCount + 1, status: "pending" as const, error: null }
                : t
            )
          );
        }, delay);
        timersRef.current.set(id, timer);
      }
      setQueue((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "failed" as const, error } : t))
      );
    },
    [queue, cleanupTimer]
  );

  const retry = useCallback(async (id: string) => {
    cleanupTimer(id);
    setQueue((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, status: "pending" as const, retryCount: t.retryCount + 1, error: null }
          : t
      )
    );
  }, [cleanupTimer]);

  const purge = useCallback(() => {
    timersRef.current.forEach((timer) => clearTimeout(timer));
    timersRef.current.clear();
    setQueue([]);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => clearTimeout(timer));
    };
  }, []);

  return {
    queue,
    enqueue,
    updateTxHash,
    markConfirmed,
    markFailed,
    retry,
    purge,
    pendingCount: queue.filter((t) => t.status === "pending" || t.status === "submitted").length,
  };
}
