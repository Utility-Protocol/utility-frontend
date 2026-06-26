/**
 * LRU cache index for tiles.
 *
 * A doubly-linked list keeps entries in recency order (most-recently-used at the
 * head). Eviction, however, is value-aware: it prefers stale tiles, then the
 * lowest `access_count / age` ratio — a tile that has been hit rarely relative
 * to how long it has sat in the cache is the cheapest to drop.
 */

import {
  EVICTION_BATCH,
  EVICTION_THRESHOLD,
  type TileMeta,
} from "@/types/tile";
import { isStale } from "@/utils/tileMath";

interface Node {
  meta: TileMeta;
  prev: Node | null;
  next: Node | null;
}

export interface EvictionCandidate {
  key: string;
  score: number;
  stale: boolean;
}

export class LRUList {
  private readonly map = new Map<string, Node>();
  private head: Node | null = null; // most-recently-used
  private tail: Node | null = null; // least-recently-used
  private bytes = 0;

  get size(): number {
    return this.map.size;
  }
  get byteSize(): number {
    return this.bytes;
  }
  has(key: string): boolean {
    return this.map.has(key);
  }
  keys(): string[] {
    return [...this.map.keys()];
  }

  /** Insert (or replace) an entry at the head. */
  add(meta: TileMeta): void {
    const existing = this.map.get(meta.key);
    if (existing) {
      this.bytes += meta.size - existing.meta.size;
      existing.meta = meta;
      this.moveToHead(existing);
      return;
    }
    const node: Node = { meta, prev: null, next: null };
    this.map.set(meta.key, node);
    this.bytes += meta.size;
    this.attachHead(node);
  }

  /** Record a cache hit: bump access stats and promote to MRU. Returns meta. */
  touch(key: string, now: number): TileMeta | null {
    const node = this.map.get(key);
    if (!node) return null;
    node.meta = {
      ...node.meta,
      accessCount: node.meta.accessCount + 1,
      lastAccess: now,
    };
    this.moveToHead(node);
    return node.meta;
  }

  get(key: string): TileMeta | null {
    return this.map.get(key)?.meta ?? null;
  }

  remove(key: string): boolean {
    const node = this.map.get(key);
    if (!node) return false;
    this.detach(node);
    this.map.delete(key);
    this.bytes -= node.meta.size;
    return true;
  }

  /** True once the cache has grown to the eviction threshold. */
  shouldEvict(threshold: number = EVICTION_THRESHOLD): boolean {
    return this.map.size >= threshold;
  }

  /** value ratio: hits per ms of age (lower → better eviction candidate). */
  private static score(meta: TileMeta, now: number): number {
    const age = Math.max(1, now - meta.fetchedAt);
    return meta.accessCount / age;
  }

  /**
   * Choose up to `count` keys to evict: stale tiles first, then ascending
   * `access_count / age`, with least-recently-used as the final tie-breaker.
   */
  evictionCandidates(count: number, now: number): EvictionCandidate[] {
    const all: (EvictionCandidate & { lastAccess: number })[] = [];
    for (const node of this.map.values()) {
      all.push({
        key: node.meta.key,
        score: LRUList.score(node.meta, now),
        stale: isStale(node.meta, now),
        lastAccess: node.meta.lastAccess,
      });
    }
    all.sort((a, b) => {
      if (a.stale !== b.stale) return a.stale ? -1 : 1; // stale first
      if (a.score !== b.score) return a.score - b.score; // lowest ratio first
      return a.lastAccess - b.lastAccess; // then LRU
    });
    return all.slice(0, count).map(({ key, score, stale }) => ({ key, score, stale }));
  }

  /** Evict up to `count` entries and return the removed keys. */
  evict(now: number, count: number = EVICTION_BATCH): string[] {
    const victims = this.evictionCandidates(count, now).map((c) => c.key);
    for (const key of victims) this.remove(key);
    return victims;
  }

  // --- doubly-linked list internals ----------------------------------------

  private attachHead(node: Node): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  private detach(node: Node): void {
    if (node.prev) node.prev.next = node.next;
    else this.head = node.next;
    if (node.next) node.next.prev = node.prev;
    else this.tail = node.prev;
    node.prev = null;
    node.next = null;
  }

  private moveToHead(node: Node): void {
    if (this.head === node) return;
    this.detach(node);
    this.attachHead(node);
  }

  /** Keys ordered MRU → LRU (for tests / inspection). */
  orderedKeys(): string[] {
    const out: string[] = [];
    for (let n = this.head; n; n = n.next) out.push(n.meta.key);
    return out;
  }
}
