'use client';

import { useEffect, useRef } from 'react';
import { updateBoundary, getAffectedTiles } from './boundaryManager';

interface AssetPosition {
  id: string;
  lat: number;
  lng: number;
  value: number;
}

interface HeatmapProps {
  assets: AssetPosition[];
  boundaries: Array<{
    id: string;
    layer: 'service_district' | 'flood_zone' | 'grid_region';
    region: { minX: number; minY: number; maxX: number; maxY: number };
  }>;
  onTileUpdate?: (tileKey: string, data: Float32Array) => void;
}

export function AssetHeatmapLayer({ assets, boundaries, onTileUpdate }: HeatmapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    for (const boundary of boundaries) {
      const tiles = getAffectedTiles(boundary.layer, boundary.region);

      updateBoundary({
        id: boundary.id,
        layer: boundary.layer,
        tiles,
        updateFn: async (_tileKey: string) => {
          const heatValues = new Float32Array(256 * 256);
          for (const asset of assets) {
            const tx = Math.floor((asset.lng - boundary.region.minX) / (boundary.region.maxX - boundary.region.minX) * 256);
            const ty = Math.floor((asset.lat - boundary.region.minY) / (boundary.region.maxY - boundary.region.minY) * 256);
            if (tx >= 0 && tx < 256 && ty >= 0 && ty < 256) {
              heatValues[ty * 256 + tx] += asset.value;
            }
          }
          onTileUpdate?.(_tileKey, heatValues);
          return heatValues;
        },
      });
    }
  }, [assets, boundaries, onTileUpdate]);

  return <canvas ref={canvasRef} width={800} height={600} />;
}
