/**
 * Timer-wheel worker. Holds the wheel and runs the tick loop off the main
 * thread so it keeps firing at full resolution while the tab is throttled.
 *
 * With a SharedArrayBuffer it sleeps each tick on `Atomics.wait(HEARTBEAT, …,
 * 100)`, which is woken early when the main thread posts a command (via
 * Atomics.notify). Without one it degrades to a 100 ms timed loop. Each tick it
 * reads the drift correction, advances the wheel, and posts any fired jobs.
 */

import { TimerWheel } from "@/utils/timerWheelCore";
import {
  futexWait,
  incrementHeartbeat,
  isRunning,
  readDrift,
  setRunning,
  writeLastNow,
  viewOf,
} from "@/utils/sharedBuffer";
import { SAB_INDEX, SLOT_MS } from "@/types/scheduler";
import type { SchedulerCommand, SchedulerEvent } from "@/types/scheduler";

type InitMessage = {
  type: "init";
  buffer: SharedArrayBuffer | ArrayBuffer;
  shared: boolean;
};

const worker = self as unknown as Worker;

let view: Int32Array | null = null;
let shared = false;
let wheel: TimerWheel | null = null;
let looping = false;

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function post(event: SchedulerEvent): void {
  worker.postMessage(event);
}

async function runLoop(): Promise<void> {
  if (looping || !view || !wheel) return;
  looping = true;
  try {
    while (view && wheel && isRunning(view)) {
      const heartbeat = Atomics.load(view, SAB_INDEX.HEARTBEAT);
      if (shared) {
        // Sleep up to one slot; woken early by a command's Atomics.notify.
        futexWait(view, SAB_INDEX.HEARTBEAT, heartbeat, SLOT_MS);
      } else {
        await delay(SLOT_MS);
      }
      if (!isRunning(view)) break;

      const now = Date.now();
      writeLastNow(view, now);
      wheel.setDrift(readDrift(view));
      const fired = wheel.advance(now);
      if (fired.length > 0) post({ type: "fired", jobs: fired });
      incrementHeartbeat(view);
    }
  } catch (err) {
    post({ type: "error", message: (err as Error).message });
  } finally {
    looping = false;
  }
}

worker.addEventListener(
  "message",
  (event: MessageEvent<InitMessage | SchedulerCommand>) => {
    const data = event.data;

    if (data.type === "init") {
      view = viewOf(data.buffer).view;
      shared = data.shared;
      wheel = new TimerWheel(Date.now());
      setRunning(view, true);
      post({ type: "ready", shared });
      void runLoop();
      return;
    }

    if (!wheel) return;
    switch (data.type) {
      case "schedule":
        try {
          wheel.schedule(data.job);
        } catch (err) {
          post({ type: "error", message: (err as Error).message });
        }
        break;
      case "cancel":
        wheel.cancel(data.jobId);
        break;
      case "terminate":
        if (view) setRunning(view, false);
        break;
    }
  }
);
