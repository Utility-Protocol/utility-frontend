import { describe, it, expect, beforeEach } from 'vitest';
import { clearStore, getTile, acquireTileLock, writeTile, atomicSwapTile, getTileGeneration } from '../../src/components/map/heatmapStore';
import { getAffectedTiles } from '../../src/components/map/boundaryManager';

describe('heatmapStore', () => {
  beforeEach(() => clearStore());

  it('writes and reads tile data', () => {
    const data = new Float32Array([1, 2, 3]);
    atomicSwapTile('test:0:0', data);
    expect(getTile('test:0:0')).toEqual(data);
  });

  it('increments generation on each write', () => {
    atomicSwapTile('a:0:0', new Float32Array(1));
    expect(getTileGeneration('a:0:0')).toBe(1);
    atomicSwapTile('a:0:0', new Float32Array(1));
    expect(getTileGeneration('a:0:0')).toBe(2);
  });

  it('discards stale writes', () => {
    atomicSwapTile('b:0:0', new Float32Array([1]));
    const gen = getTileGeneration('b:0:0');
    const result = writeTile('b:0:0', gen - 1, new Float32Array([99]));
    expect(result).toBe(false);
    expect(getTile('b:0:0')![0]).toBe(1);
  });

  it('acquires and releases tile lock', async () => {
    const release = await acquireTileLock('lock:0:0');
    expect(getTileGeneration('lock:0:0')).toBe(1);
    release();
  });

  it('returns undefined for missing tile', () => {
    expect(getTile('nonexistent')).toBeUndefined();
  });
});

describe('boundaryManager', () => {
  it('generates tile keys for a region', () => {
    const tiles = getAffectedTiles('flood_zone', {
      minX: 0, minY: 0, maxX: 300, maxY: 300,
    });
    expect(tiles).toContain('flood_zone::0,0');
    expect(tiles).toContain('flood_zone::1,0');
    expect(tiles).toContain('flood_zone::0,1');
    expect(tiles).toContain('flood_zone::1,1');
  });

  it('handles single-tile region', () => {
    const tiles = getAffectedTiles('grid_region', {
      minX: 0, minY: 0, maxX: 100, maxY: 100,
    });
    expect(tiles).toEqual(['grid_region::0,0']);
  });
});
