"use client";

import { openDB, type IDBPDatabase } from "idb";

/**
 * IndexedDB-backed cache for the Groth16 proving key (`circuit_final.zkey`,
 * ~150 MB). The key is far too large to re-download per proof, so it is
 * persisted with a SHA-256 integrity check and LRU eviction. Downloads are
 * resumable via HTTP Range requests so a dropped connection on a field tablet
 * does not force a full restart.
 */

const DB_NAME = "utility-zk-keys";
const DB_VERSION = 1;

const KEY_STORE = "proving-keys";
const CHUNK_STORE = "partial-downloads";

/** Total bytes the cache may hold before LRU eviction kicks in (~600 MB). */
const MAX_CACHE_BYTES = 600 * 1024 * 1024;

/** Range request window. 8 MB balances request overhead vs. resume latency. */
const RANGE_CHUNK_BYTES = 8 * 1024 * 1024;

export interface CachedKey {
  /** Canonical source URL — primary key. */
  url: string;
  /** The verified key bytes. */
  bytes: ArrayBuffer;
  /** Lowercase hex SHA-256 of `bytes`. */
  sha256: string;
  size: number;
  downloadedAt: number;
  lastAccess: number;
}

interface PartialDownload {
  url: string;
  /** Concatenated chunks received so far. */
  bytes: ArrayBuffer;
  /** Bytes received; equals `bytes.byteLength`, kept for clarity. */
  received: number;
  /** Total size advertised by the server, if known. */
  total: number | null;
  updatedAt: number;
}

export interface DownloadProgress {
  received: number;
  total: number | null;
  /** 0–100, or null when total length is unknown. */
  percent: number | null;
}

export class IntegrityError extends Error {
  constructor(
    readonly url: string,
    readonly expected: string,
    readonly actual: string
  ) {
    super(
      `Integrity check failed for ${url}: expected ${expected}, got ${actual}`
    );
    this.name = "IntegrityError";
  }
}

let dbInstance: IDBPDatabase | null = null;

async function getDb(): Promise<IDBPDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(KEY_STORE)) {
        const store = db.createObjectStore(KEY_STORE, { keyPath: "url" });
        store.createIndex("lastAccess", "lastAccess");
      }
      if (!db.objectStoreNames.contains(CHUNK_STORE)) {
        db.createObjectStore(CHUNK_STORE, { keyPath: "url" });
      }
    },
  });
  return dbInstance;
}

/** Lowercase hex SHA-256 of the given bytes using SubtleCrypto. */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function concat(a: ArrayBuffer, b: ArrayBuffer): ArrayBuffer {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(new Uint8Array(a), 0);
  out.set(new Uint8Array(b), a.byteLength);
  return out.buffer;
}

/**
 * Return a cached, integrity-verified key if present and valid. A mismatched
 * checksum evicts the entry and resolves to `null` so the caller re-downloads.
 */
export async function getCachedKey(
  url: string,
  expectedSha256?: string
): Promise<CachedKey | null> {
  try {
    const db = await getDb();
    const entry = (await db.get(KEY_STORE, url)) as CachedKey | undefined;
    if (!entry) return null;

    if (expectedSha256 && entry.sha256 !== expectedSha256.toLowerCase()) {
      await db.delete(KEY_STORE, url);
      return null;
    }

    // Touch for LRU.
    entry.lastAccess = Date.now();
    await db.put(KEY_STORE, entry);
    return entry;
  } catch {
    return null;
  }
}

/** Evict least-recently-used keys until the cache fits within the budget. */
async function evictToFit(db: IDBPDatabase, incomingBytes: number): Promise<void> {
  const all = (await db.getAll(KEY_STORE)) as CachedKey[];
  let used = all.reduce((sum, e) => sum + e.size, 0);
  if (used + incomingBytes <= MAX_CACHE_BYTES) return;

  // Oldest access first.
  all.sort((a, b) => a.lastAccess - b.lastAccess);
  for (const entry of all) {
    if (used + incomingBytes <= MAX_CACHE_BYTES) break;
    await db.delete(KEY_STORE, entry.url);
    used -= entry.size;
  }
}

async function persistKey(entry: CachedKey): Promise<void> {
  const db = await getDb();
  await evictToFit(db, entry.size);
  await db.put(KEY_STORE, entry);
  // Clear any resumable state now that the full key is stored.
  await db.delete(CHUNK_STORE, entry.url).catch(() => {});
}

async function loadPartial(url: string): Promise<PartialDownload | null> {
  try {
    const db = await getDb();
    return ((await db.get(CHUNK_STORE, url)) as PartialDownload) ?? null;
  } catch {
    return null;
  }
}

async function savePartial(partial: PartialDownload): Promise<void> {
  try {
    const db = await getDb();
    await db.put(CHUNK_STORE, partial);
  } catch {
    // Resumable state is best-effort; a failure just means a full restart.
  }
}

/**
 * Download `url` into the cache, resuming any partial transfer, verifying the
 * SHA-256 and evicting LRU entries to stay within budget. Returns the verified
 * bytes. `signal` aborts the transfer; partial progress is retained for resume.
 */
export async function downloadKey(
  url: string,
  options: {
    expectedSha256?: string;
    onProgress?: (p: DownloadProgress) => void;
    signal?: AbortSignal;
  } = {}
): Promise<ArrayBuffer> {
  const { expectedSha256, onProgress, signal } = options;

  // Reuse any already-verified copy.
  const cached = await getCachedKey(url, expectedSha256);
  if (cached) {
    onProgress?.({ received: cached.size, total: cached.size, percent: 100 });
    return cached.bytes;
  }

  let partial = await loadPartial(url);
  let buffer = partial?.bytes ?? new ArrayBuffer(0);
  let received = buffer.byteLength;
  let total = partial?.total ?? null;

  const emit = () =>
    onProgress?.({
      received,
      total,
      percent: total ? Math.min(100, Math.round((received / total) * 100)) : null,
    });
  emit();

  // Probe total size once so we can drive the range loop and progress bar.
  if (total === null) {
    const head = await fetch(url, { method: "HEAD", signal });
    const len = head.headers.get("content-length");
    total = len ? Number(len) : null;
    if (head.headers.get("accept-ranges") !== "bytes") {
      // Server cannot resume — fall back to a single streamed download.
      return streamWhole(url, { expectedSha256, onProgress, signal });
    }
  }

  while (total === null || received < total) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const end =
      total !== null
        ? Math.min(received + RANGE_CHUNK_BYTES, total) - 1
        : received + RANGE_CHUNK_BYTES - 1;

    const res = await fetch(url, {
      headers: { Range: `bytes=${received}-${end}` },
      signal,
    });
    if (res.status !== 206 && res.status !== 200) {
      throw new Error(`Range request failed: HTTP ${res.status}`);
    }
    const chunk = await res.arrayBuffer();
    if (chunk.byteLength === 0) break; // No more data.

    buffer = concat(buffer, chunk);
    received = buffer.byteLength;

    partial = { url, bytes: buffer, received, total, updatedAt: Date.now() };
    await savePartial(partial);
    emit();

    if (res.status === 200) break; // Server ignored Range and sent everything.
  }

  // Verify integrity before committing.
  const actual = await sha256Hex(buffer);
  if (expectedSha256 && actual !== expectedSha256.toLowerCase()) {
    // Discard the corrupt partial so the next attempt starts clean.
    const db = await getDb();
    await db.delete(CHUNK_STORE, url).catch(() => {});
    throw new IntegrityError(url, expectedSha256.toLowerCase(), actual);
  }

  const now = Date.now();
  await persistKey({
    url,
    bytes: buffer,
    sha256: actual,
    size: buffer.byteLength,
    downloadedAt: now,
    lastAccess: now,
  });
  return buffer;
}

/** Single-shot download for servers that do not support Range requests. */
async function streamWhole(
  url: string,
  options: {
    expectedSha256?: string;
    onProgress?: (p: DownloadProgress) => void;
    signal?: AbortSignal;
  }
): Promise<ArrayBuffer> {
  const { expectedSha256, onProgress, signal } = options;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);

  const total = Number(res.headers.get("content-length")) || null;
  const reader = res.body?.getReader();
  if (!reader) {
    const buf = await res.arrayBuffer();
    onProgress?.({ received: buf.byteLength, total, percent: 100 });
    return finalizeWhole(url, buf, expectedSha256);
  }

  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onProgress?.({
      received,
      total,
      percent: total ? Math.round((received / total) * 100) : null,
    });
  }

  const merged = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return finalizeWhole(url, merged.buffer, expectedSha256);
}

async function finalizeWhole(
  url: string,
  buffer: ArrayBuffer,
  expectedSha256?: string
): Promise<ArrayBuffer> {
  const actual = await sha256Hex(buffer);
  if (expectedSha256 && actual !== expectedSha256.toLowerCase()) {
    throw new IntegrityError(url, expectedSha256.toLowerCase(), actual);
  }
  const now = Date.now();
  await persistKey({
    url,
    bytes: buffer,
    sha256: actual,
    size: buffer.byteLength,
    downloadedAt: now,
    lastAccess: now,
  });
  return buffer;
}

/** Remove a single cached key and any partial download state. */
export async function evictKey(url: string): Promise<void> {
  try {
    const db = await getDb();
    await db.delete(KEY_STORE, url);
    await db.delete(CHUNK_STORE, url);
  } catch {
    // best-effort
  }
}

/** Sum of all cached key sizes in bytes. */
export async function getCacheSize(): Promise<number> {
  try {
    const db = await getDb();
    const all = (await db.getAll(KEY_STORE)) as CachedKey[];
    return all.reduce((sum, e) => sum + e.size, 0);
  } catch {
    return 0;
  }
}

/** Drop every cached key and partial download. */
export async function clearKeyCache(): Promise<void> {
  try {
    const db = await getDb();
    await db.clear(KEY_STORE);
    await db.clear(CHUNK_STORE);
  } catch {
    // best-effort
  }
}
