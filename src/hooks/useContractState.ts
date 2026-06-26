"use client";

import { useCallback, useEffect, useRef } from "react";
import { LamportClock } from "@/utils/lamportClock";
import { mergeEvents } from "@/utils/crdtMerge";
import {
  crdtStore,
  runStalenessWatch,
  useCrdtState,
  type CrdtState,
} from "@/store/slices/crdtSlice";
import {
  RECONCILE_TIMEOUT_MS,
  type ChainId,
  type CrdtEvent,
} from "@/types/crdt";
import type {
  CrdtMergeRequest,
  CrdtMergeResponse,
} from "@/workers/crdtMerge.worker";

/**
 * Subscribes the dashboard to multi-chain Soroban events. Each ingested event
 * is stamped with the originating chain's Lamport clock, batched, and merged
 * (off-thread when a worker is available, otherwise inline). Merged diffs are
 * applied to {@link crdtStore}, and a staleness watch flags any chain that has
 * gone quiet past the reconcile timeout.
 */

/** An event before it is Lamport-stamped (the clock supplies the timestamp). */
export type RawCrdtEvent = Omit<CrdtEvent, "timestamp">;

export interface UseContractStateDeps {
  createWorker?: () => Worker;
  now?: () => number;
  /** How often to flush the event batch (ms). @default 16 */
  flushIntervalMs?: number;
  /** How often to run the staleness watch (ms). @default 5000 */
  stalenessIntervalMs?: number;
  reconcileTimeoutMs?: number;
  /** Called when a chain must be fully re-fetched. */
  onReconcile?: (chainId: ChainId) => void;
}

export interface UseContractStateResult {
  state: CrdtState;
  /** Stamp and enqueue an event from a chain. */
  ingest: (chainId: ChainId, event: RawCrdtEvent) => void;
  reconciling: ChainId[];
}

export function useContractState(
  deps: UseContractStateDeps = {}
): UseContractStateResult {
  const state = useCrdtState();

  const clocksRef = useRef<Map<ChainId, LamportClock>>(new Map());
  const batchRef = useRef<CrdtEvent[]>([]);
  const workerRef = useRef<Worker | null>(null);
  const batchSeqRef = useRef(0);
  const depsRef = useRef(deps);
  depsRef.current = deps;

  const clockFor = useCallback((chainId: ChainId): LamportClock => {
    let clock = clocksRef.current.get(chainId);
    if (!clock) {
      clock = new LamportClock(chainId);
      clocksRef.current.set(chainId, clock);
    }
    return clock;
  }, []);

  const ingest = useCallback(
    (chainId: ChainId, event: RawCrdtEvent) => {
      const timestamp = clockFor(chainId).tick();
      batchRef.current.push({ ...event, timestamp } as CrdtEvent);
    },
    [clockFor]
  );

  // Flush + merge loop, worker spawn, and staleness watch.
  useEffect(() => {
    const now = depsRef.current.now ?? Date.now;
    const flushMs = depsRef.current.flushIntervalMs ?? 16;
    const staleMs = depsRef.current.stalenessIntervalMs ?? 5000;
    const reconcileTimeout =
      depsRef.current.reconcileTimeoutMs ?? RECONCILE_TIMEOUT_MS;

    // Try to run the merge off the main thread.
    const createWorker = depsRef.current.createWorker;
    if (createWorker) {
      try {
        const worker = createWorker();
        worker.onmessage = (e: MessageEvent<CrdtMergeResponse>) => {
          const { diffs, chainSeen } = e.data;
          crdtStore.dispatch({
            type: "APPLY_DIFFS",
            payload: { diffs, chainSeen, at: now() },
          });
        };
        workerRef.current = worker;
      } catch {
        workerRef.current = null;
      }
    }

    const flush = () => {
      if (batchRef.current.length === 0) return;
      const events = batchRef.current;
      batchRef.current = [];

      const worker = workerRef.current;
      if (worker) {
        const request: CrdtMergeRequest = {
          type: "merge",
          batchId: ++batchSeqRef.current,
          events,
        };
        worker.postMessage(request);
      } else {
        // Inline fallback: merge against the current store state.
        const snapshot = crdtStore.getState();
        const { diffs, chainSeen } = mergeEvents(
          snapshot.resources,
          snapshot.vectorClocks,
          events
        );
        crdtStore.dispatch({
          type: "APPLY_DIFFS",
          payload: { diffs, chainSeen, at: now() },
        });
      }
    };

    const flushTimer = setInterval(flush, flushMs);
    const staleTimer = setInterval(() => {
      const flagged = runStalenessWatch(now(), reconcileTimeout);
      for (const chainId of flagged) depsRef.current.onReconcile?.(chainId);
    }, staleMs);

    return () => {
      clearInterval(flushTimer);
      clearInterval(staleTimer);
      const worker = workerRef.current;
      if (worker) {
        worker.postMessage({ type: "reset" } satisfies CrdtMergeRequest);
        worker.terminate();
        workerRef.current = null;
      }
    };
  }, []);

  return { state, ingest, reconciling: state.reconciling };
}
