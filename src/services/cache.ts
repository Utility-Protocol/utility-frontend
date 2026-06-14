"use client";

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "utility-cache";
const DB_VERSION = 1;
const CACHE_PREFIX = "utility";

interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  timestamp: number;
  ttl: number;
}

let dbInstance: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("kv")) {
        const store = db.createObjectStore("kv", { keyPath: "key" });
        store.createIndex("timestamp", "timestamp");
        store.createIndex("ttl", "ttl");
      }
    },
  });
  return dbInstance;
}

export function buildCacheKey(parts: string[]): string {
  return `${CACHE_PREFIX}:${parts.join(":")}`;
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const db = await getDb();
    const entry = await db.get("kv", key);
    if (!entry) return null;
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      await db.delete("kv", key);
      return null;
    }
    return entry.value as T;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlMs = 5 * 60 * 1000
): Promise<void> {
  try {
    const db = await getDb();
    const entry: CacheEntry<T> = {
      key,
      value,
      timestamp: Date.now(),
      ttl: ttlMs,
    };
    await db.put("kv", entry);
  } catch {
    // silently fail — cache is best-effort
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete("kv", key);
  } catch {
    // silently fail
  }
}

export async function cacheClear(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear("kv");
  } catch {
    // silently fail
  }
}

export async function cacheKeys(prefix?: string): Promise<string[]> {
  try {
    const db = await getDb();
    const all = await db.getAllKeys("kv");
    if (prefix) return all.filter((k) => String(k).startsWith(prefix)).map(String);
    return all.map(String);
  } catch {
    return [];
  }
}

export async function cacheGetBulk<T>(keys: string[]): Promise<Map<string, T>> {
  const results = new Map<string, T>();
  try {
    const db = await getDb();
    for (const key of keys) {
      const entry = await db.get("kv", key);
      if (entry && Date.now() - entry.timestamp <= entry.ttl) {
        results.set(key, entry.value as T);
      }
    }
  } catch {
    // silently fail
  }
  return results;
}
