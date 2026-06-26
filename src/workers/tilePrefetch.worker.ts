/**
 * Tile prefetch worker. Receives a predicted bounding box + zoom range, expands
 * it into tile coordinates, fetches each tile off the main thread, and writes
 * the blob into the shared IndexedDB cache. A new request supersedes the
 * previous one (a sharp heading change cancels the in-flight burst).
 */

import { TileCache } from "@/services/tileCache";
import { tileKey, tilesInBBox } from "@/utils/tileMath";
import type { PrefetchRequest } from "@/types/tile";

type ConfigMessage = { type: "config"; urlTemplate: string };
type PrefetchMessage = { type: "prefetch"; request: PrefetchRequest };
type CancelMessage = { type: "cancel" };
type IncomingMessage = ConfigMessage | PrefetchMessage | CancelMessage;

export type TilePrefetchEvent =
  | { type: "progress"; requestId: number; fetched: number; total: number }
  | { type: "done"; requestId: number; fetched: number; skipped: number }
  | { type: "error"; message: string };

const worker = self as unknown as Worker;
const cache = new TileCache();
let cacheReady: Promise<void> | null = null;
let urlTemplate = "";
let activeRequestId = 0;

function buildUrl(z: number, x: number, y: number): string {
  return urlTemplate
    .replace("{z}", String(z))
    .replace("{x}", String(x))
    .replace("{y}", String(y));
}

async function processRequest(request: PrefetchRequest): Promise<void> {
  if (!cacheReady) cacheReady = cache.open();
  await cacheReady;

  const tiles = request.zoomLevels.flatMap((z) => tilesInBBox(request.bbox, z));
  let fetched = 0;
  let skipped = 0;

  for (const tile of tiles) {
    // A newer request superseded this burst — stop early.
    if (request.requestId !== activeRequestId) return;

    const key = tileKey(tile.z, tile.x, tile.y);
    if (cache.has(key)) {
      skipped += 1;
      continue;
    }
    try {
      const res = await fetch(buildUrl(tile.z, tile.x, tile.y));
      if (!res.ok) continue;
      const blob = await res.blob();
      await cache.put(key, tile.z, blob);
      fetched += 1;
      worker.postMessage({
        type: "progress",
        requestId: request.requestId,
        fetched,
        total: tiles.length,
      } satisfies TilePrefetchEvent);
    } catch {
      // Offline / transient error — skip this tile, keep prefetching the rest.
    }
  }

  if (request.requestId === activeRequestId) {
    worker.postMessage({
      type: "done",
      requestId: request.requestId,
      fetched,
      skipped,
    } satisfies TilePrefetchEvent);
  }
}

worker.addEventListener("message", (event: MessageEvent<IncomingMessage>) => {
  const msg = event.data;
  switch (msg.type) {
    case "config":
      urlTemplate = msg.urlTemplate;
      break;
    case "cancel":
      activeRequestId += 1; // invalidate the in-flight burst
      break;
    case "prefetch":
      activeRequestId = msg.request.requestId;
      void processRequest(msg.request).catch((err) =>
        worker.postMessage({
          type: "error",
          message: (err as Error).message,
        } satisfies TilePrefetchEvent)
      );
      break;
  }
});
