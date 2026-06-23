import { acquireTileLock, writeTile, getTileGeneration } from './heatmapStore';

interface Boundary {
  id: string;
  layer: 'service_district' | 'flood_zone' | 'grid_region';
  tiles: string[];
  updateFn: (tileKey: string) => Promise<Float32Array>;
}

const pendingUpdates = new Map<string, Promise<void>>();

export async function updateBoundary(boundary: Boundary): Promise<void> {
  for (const tileKey of boundary.tiles) {
    const key = tileKey;
    if (pendingUpdates.has(key)) {
      await pendingUpdates.get(key);
    }

    const task = (async () => {
      const release = await acquireTileLock(key);
      try {
        const gen = getTileGeneration(key);
        const data = await boundary.updateFn(key);
        writeTile(key, gen, data);
      } finally {
        release();
        pendingUpdates.delete(key);
      }
    })();

    pendingUpdates.set(key, task);
  }
}

export function getAffectedTiles(
  layer: Boundary['layer'],
  region: { minX: number; minY: number; maxX: number; maxY: number }
): string[] {
  const tiles: string[] = [];
  const tileSize = 256;
  const startX = Math.floor(region.minX / tileSize);
  const startY = Math.floor(region.minY / tileSize);
  const endX = Math.floor(region.maxX / tileSize);
  const endY = Math.floor(region.maxY / tileSize);

  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      tiles.push(layer + '::' + x + ',' + y);
    }
  }
  return tiles;
}
