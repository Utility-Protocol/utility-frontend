"use client";

import { useState, useCallback, useRef } from "react";

type MutationStatus = "idle" | "pending" | "confirmed" | "failed";

interface OptimisticMutation<TData = unknown> {
  id: string;
  data: TData;
  status: MutationStatus;
  error: string | null;
  submittedAt: number;
  confirmedAt: number | null;
}

interface UseEscrowReturn<TData> {
  mutations: OptimisticMutation<TData>[];
  submit: (data: TData) => Promise<void>;
  rollback: (mutationId: string) => void;
  retry: (mutationId: string) => Promise<void>;
  pendingCount: number;
}

let mutationCounter = 0;

export function useEscrow<TData = unknown>(
  onChainSubmit: (data: TData) => Promise<void>,
  onRollback: (data: TData) => Promise<void>
): UseEscrowReturn<TData> {
  const [mutations, setMutations] = useState<OptimisticMutation<TData>[]>([]);
  const pendingRef = useRef(new Set<string>());

  const submit = useCallback(
    async (data: TData) => {
      const id = `mutation-${++mutationCounter}`;
      const mutation: OptimisticMutation<TData> = {
        id,
        data,
        status: "pending",
        error: null,
        submittedAt: Date.now(),
        confirmedAt: null,
      };

      setMutations((prev) => [mutation, ...prev]);
      pendingRef.current.add(id);

      try {
        await onChainSubmit(data);
        if (!pendingRef.current.has(id)) return;
        setMutations((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, status: "confirmed", confirmedAt: Date.now() }
              : m
          )
        );
      } catch (error) {
        if (!pendingRef.current.has(id)) return;
        setMutations((prev) =>
          prev.map((m) =>
            m.id === id
              ? { ...m, status: "failed", error: (error as Error).message }
              : m
          )
        );
      } finally {
        pendingRef.current.delete(id);
      }
    },
    [onChainSubmit]
  );

  const rollback = useCallback(
    async (mutationId: string) => {
      pendingRef.current.delete(mutationId);
      const target = mutations.find((m) => m.id === mutationId);
      if (!target || target.status !== "pending") return;

      setMutations((prev) =>
        prev.map((m) =>
          m.id === mutationId ? { ...m, status: "idle", error: "Rolled back" } : m
        )
      );
      await onRollback(target.data);
    },
    [mutations, onRollback]
  );

  const retry = useCallback(
    async (mutationId: string) => {
      const target = mutations.find((m) => m.id === mutationId);
      if (!target || target.status !== "failed") return;
      await submit(target.data);
    },
    [mutations, submit]
  );

  return {
    mutations,
    submit,
    rollback,
    retry,
    pendingCount: mutations.filter((m) => m.status === "pending").length,
  };
}
