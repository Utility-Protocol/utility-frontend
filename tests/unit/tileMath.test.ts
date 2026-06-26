import { describe, it, expect } from "vitest";
import {
  tileKey,
  parseTileKey,
  lngLatToTile,
  tileBounds,
  tilesInBBox,
  headingDelta,
  isStaleHeading,
  shouldPrefetch,
  predictCenter,
  burstTiles,
  zoomLevelsFor,
  ttlForZoom,
  isStale,
} from "@/utils/tileMath";
import { TTL_MS, type GeoSample, type TileMeta } from "@/types/tile";

const sample = (over: Partial<GeoSample> = {}): GeoSample => ({
  lng: 0,
  lat: 0,
  heading: 0,
  speed: 5,
  timestamp: 0,
  ...over,
});

describe("tile keys & coordinates", () => {
  it("round-trips keys", () => {
    expect(tileKey(14, 100, 200)).toBe("14/100/200");
    expect(parseTileKey("14/100/200")).toEqual({ z: 14, x: 100, y: 200 });
  });

  it("maps the origin to tile 0/0 and the prime meridian/equator near center", () => {
    // 0,0 at zoom 1 → x = 1 (just east of meridian), y = 1 (just south of equator)
    expect(lngLatToTile(0, 0, 1)).toEqual({ z: 1, x: 1, y: 1 });
    expect(lngLatToTile(-180, 85, 2)).toEqual({ z: 2, x: 0, y: 0 });
  });

  it("tileBounds are consistent with the tile that contains their center", () => {
    const t = { z: 12, x: 2048, y: 1362 };
    const b = tileBounds(t);
    const midLng = (b.west + b.east) / 2;
    const midLat = (b.north + b.south) / 2;
    expect(lngLatToTile(midLng, midLat, 12)).toEqual(t);
  });
});

describe("tilesInBBox", () => {
  it("covers a bbox spanning a few tiles", () => {
    const bbox = { ...tileBounds({ z: 10, x: 100, y: 200 }) };
    const tiles = tilesInBBox(bbox, 10);
    expect(tiles).toContainEqual({ z: 10, x: 100, y: 200 });
  });
});

describe("heading & velocity gating", () => {
  it("computes the smallest angular delta", () => {
    expect(headingDelta(10, 350)).toBe(20);
    expect(headingDelta(0, 180)).toBe(180);
  });

  it("flags a stale heading past 30°", () => {
    expect(isStaleHeading(0, 31)).toBe(true);
    expect(isStaleHeading(0, 29)).toBe(false);
  });

  it("prefetches only above the velocity threshold", () => {
    expect(shouldPrefetch(sample({ speed: 3 }))).toBe(true);
    expect(shouldPrefetch(sample({ speed: 1 }))).toBe(false);
    expect(shouldPrefetch(sample({ speed: null }))).toBe(false);
  });
});

describe("predictCenter", () => {
  it("projects north when heading 0", () => {
    const c = predictCenter(sample({ heading: 0, speed: 10 }), 10); // 100 m north
    expect(c.lat).toBeGreaterThan(0);
    expect(c.lng).toBeCloseTo(0, 6);
  });

  it("projects east when heading 90", () => {
    const c = predictCenter(sample({ heading: 90, speed: 10 }), 10);
    expect(c.lng).toBeGreaterThan(0);
    expect(c.lat).toBeCloseTo(0, 6);
  });

  it("returns the current position when stationary or heading unknown", () => {
    expect(predictCenter(sample({ speed: 0 }))).toEqual({ lng: 0, lat: 0 });
    expect(predictCenter(sample({ heading: null }))).toEqual({ lng: 0, lat: 0 });
  });
});

describe("burst pyramid", () => {
  it("bursts a 3×3 grid across 5 zoom levels (≤45 tiles)", () => {
    const tiles = burstTiles({ lng: 0, lat: 0 }, 14);
    expect(zoomLevelsFor(14)).toEqual([12, 13, 14, 15, 16]);
    // 5 zoom levels × up to 9 tiles each, minus any edge clamping.
    expect(tiles.length).toBeLessThanOrEqual(45);
    expect(tiles.length).toBeGreaterThanOrEqual(40);
    expect(new Set(tiles.map((t) => `${t.z}/${t.x}/${t.y}`)).size).toBe(tiles.length);
  });

  it("clamps zoom levels at the edges of the range", () => {
    expect(zoomLevelsFor(1)).toEqual([0, 1, 2, 3]);
  });
});

describe("TTL & staleness", () => {
  const meta = (z: number, fetchedAt: number): TileMeta => ({
    key: `${z}/0/0`,
    z,
    size: 42_000,
    fetchedAt,
    accessCount: 0,
    lastAccess: fetchedAt,
  });

  it("uses 7 days for low zoom and 48 h for high zoom", () => {
    expect(ttlForZoom(14)).toBe(TTL_MS.lowZoom);
    expect(ttlForZoom(15)).toBe(TTL_MS.highZoom);
  });

  it("detects stale tiles by zoom-dependent TTL", () => {
    const now = TTL_MS.lowZoom + 1000;
    expect(isStale(meta(14, 0), now)).toBe(true); // 7d+ old
    expect(isStale(meta(14, now - 1000), now)).toBe(false);
    expect(isStale(meta(16, now - TTL_MS.highZoom - 1), now)).toBe(true);
  });
});
