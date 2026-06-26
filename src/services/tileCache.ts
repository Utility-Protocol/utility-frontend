"use client";

import { openDB, type IDBPDatabase } from "idb";
import { LRUList } from "@/utils/lruEviction";
import {
  EVICTION_BATCH,
  WRITE_CHECK_INTERVAL,
  type TileMeta,
} from "@/types/tile";

/**
 * IndexedDB-backed vector-tile cache.
 *
 * Tile blobs live in the `tiles` store keyed by `z/x/y`; lightweight metadata
 * (size, fetched/last-access timestamps, access count) lives in `meta` and is
 * mirrored into an in-memory {@link LRUList} for O(1) hit accounting and
 * value-aware eviction. Eviction is checked every {@link WRITE_CHECK_INTERVAL}
 * writes once the cache reaches its threshold.
 */

const DB_NAME = "utility-tiles";
const DB_VERSION = 1;
const TILE_STORE = "tiles";
const META_STORE = "meta";

export interface TileBlobEntry {
  key: string;
  blob: Blob;
}

export interface TileCacheStats {
  count: number;
  bytes: number;
  evictions: number;
}

export class TileCache {
  private db: IDBPDatabase | null = null;
  private readonly lru = new LRUList();
  private writeCounter = 0;
  private evictions = 0;

  /** Open the database and rebuild the in-memory LRU index from metadata. */
  async open(): Promise<void> {
    if (this.db) return;
    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(TILE_STORE)) {
          db.createObjectStore(TILE_STORE, { keyPath: "key" });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: "key" });
        }
      },
    });
    const allMeta = (await this.db.getAll(META_STORE)) as TileMeta[];
    // Re-seed oldest → newest so the most recently accessed end up at the head.
    allMeta.sort((a, b) => a.lastAccess - b.lastAccess);
    for (const meta of allMeta) this.lru.add(meta);
  }

  /** True if the key is present in the in-memory index. */
  has(key: string): boolean {
    return this.lru.has(key);
  }

  /** Read a tile blob; records a cache hit and persists the updated metadata. */
  async get(key: string, now = Date.now()): Promise<Blob | null> {
    if (!this.db || !this.lru.has(key)) return null;
    const entry = (await this.db.get(TILE_STORE, key)) as TileBlobEntry | undefined;
    if (!entry) {
      this.lru.remove(key);
      return null;
    }
    const meta = this.lru.touch(key, now);
    if (meta) await this.db.put(META_STORE, meta);
    return entry.blob;
  }

  /** Write a tile blob + metadata and run an eviction check if it is due. */
  async put(
    key: string,
    z: number,
    blob: Blob,
    now = Date.now()
  ): Promise<void> {
    if (!this.db) return;
    const meta: TileMeta = {
      key,
      z,
      size: blob.size,
      fetchedAt: now,
      accessCount: 0,
      lastAccess: now,
    };
    await this.db.put(TILE_STORE, { key, blob } satisfies TileBlobEntry);
    await this.db.put(META_STORE, meta);
    this.lru.add(meta);

    this.writeCounter += 1;
    if (this.writeCounter % WRITE_CHECK_INTERVAL === 0 && this.lru.shouldEvict()) {
      await this.evictIfNeeded(now);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.db) return;
    this.lru.remove(key);
    await this.db.delete(TILE_STORE, key);
    await this.db.delete(META_STORE, key);
  }

  /** Evict down toward the threshold; returns the evicted keys. */
  async evictIfNeeded(now = Date.now()): Promise<string[]> {
    if (!this.db || !this.lru.shouldEvict()) return [];
    const victims = this.lru.evict(now, EVICTION_BATCH);
    const tx = this.db.transaction([TILE_STORE, META_STORE], "readwrite");
    for (const key of victims) {
      void tx.objectStore(TILE_STORE).delete(key);
      void tx.objectStore(META_STORE).delete(key);
    }
    await tx.done;
    this.evictions += victims.length;
    return victims;
  }

  stats(): TileCacheStats {
    return { count: this.lru.size, bytes: this.lru.byteSize, evictions: this.evictions };
  }

  close(): void {
    this.db?.close();
    this.db = null;
  }
}

let singleton: TileCache | null = null;

/** Shared tile cache instance. */
export function getTileCache(): TileCache {
  if (!singleton) singleton = new TileCache();
  return singleton;
}
