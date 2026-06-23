type HeatValues = Float32Array;

interface TileEntry {
  generation: number;
  data: HeatValues;
  lock: Promise<void>;
}

const store = new Map<string, TileEntry>();

export function getTile(tileKey: string): HeatValues | undefined {
  const entry = store.get(tileKey);
  return entry?.data;
}

export function getTileGeneration(tileKey: string): number {
  return store.get(tileKey)?.generation ?? 0;
}

export async function acquireTileLock(tileKey: string): Promise<() => void> {
  const entry = store.get(tileKey);
  if (entry?.lock) {
    await entry.lock;
  }

  let release: () => void;
  const lock = new Promise<void>((resolve) => {
    release = resolve;
  });

  const current = store.get(tileKey);
  store.set(tileKey, {
    generation: (current?.generation ?? 0) + 1,
    data: current?.data ?? new Float32Array(256 * 256),
    lock,
  });

  return () => release!();
}

export function writeTile(tileKey: string, generation: number, data: HeatValues): boolean {
  const entry = store.get(tileKey);
  if (!entry || generation < entry.generation) {
    return false; // stale write, discarded
  }
  store.set(tileKey, { ...entry, data, lock: Promise.resolve() });
  return true;
}

export function atomicSwapTile(tileKey: string, data: HeatValues): void {
  const entry = store.get(tileKey);
  store.set(tileKey, {
    generation: (entry?.generation ?? 0) + 1,
    data,
    lock: Promise.resolve(),
  });
}

export function clearStore(): void {
  store.clear();
}
