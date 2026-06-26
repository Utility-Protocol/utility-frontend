/**
 * CRDT merge worker. Holds the authoritative merged state off the main thread
 * and folds each incoming event batch into it, posting back the resulting
 * resource diffs. Keeping the accumulated state here means a 150 ev/s burst is
 * merged without blocking the render thread.
 */

import { mergeEvents } from "@/utils/crdtMerge";
import type {
  CrdtEvent,
  ResourceState,
  VectorClock,
} from "@/types/crdt";

export type CrdtMergeRequest =
  | { type: "merge"; batchId: number; events: CrdtEvent[] }
  | { type: "reset" };

export interface CrdtMergeResponse {
  type: "merged";
  batchId: number;
  diffs: ReturnType<typeof mergeEvents>["diffs"];
  chainSeen: ReturnType<typeof mergeEvents>["chainSeen"];
}

const worker = self as unknown as Worker;

let states: Record<string, ResourceState> = {};
let clocks: Record<string, VectorClock> = {};

worker.addEventListener("message", (event: MessageEvent<CrdtMergeRequest>) => {
  const msg = event.data;

  if (msg.type === "reset") {
    states = {};
    clocks = {};
    return;
  }

  const result = mergeEvents(states, clocks, msg.events);

  // Fold the diffs back into the worker's accumulated state.
  for (const diff of result.diffs) {
    states[diff.resourceId] = diff.state;
    clocks[diff.resourceId] = diff.vectorClock;
  }

  const response: CrdtMergeResponse = {
    type: "merged",
    batchId: msg.batchId,
    diffs: result.diffs,
    chainSeen: result.chainSeen,
  };
  worker.postMessage(response);
});
