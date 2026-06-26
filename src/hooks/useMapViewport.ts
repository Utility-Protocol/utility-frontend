"use client";

import { useEffect, useState } from "react";
import type { Viewport } from "@/types/tile";

/**
 * Exposes the Mapbox camera (center, zoom, bearing, pitch) as reactive state,
 * updated on every `move`. The map is a minimal structural interface so the hook
 * has no hard `mapbox-gl` dependency.
 */

export interface MapViewportSource {
  getCenter(): { lng: number; lat: number };
  getZoom(): number;
  getBearing(): number;
  getPitch(): number;
  on(type: "move", listener: () => void): void;
  off(type: "move", listener: () => void): void;
}

export function readViewport(map: MapViewportSource): Viewport {
  const center = map.getCenter();
  return {
    lng: center.lng,
    lat: center.lat,
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  };
}

export function useMapViewport(map: MapViewportSource | null): Viewport | null {
  const [viewport, setViewport] = useState<Viewport | null>(
    map ? readViewport(map) : null
  );

  useEffect(() => {
    if (!map) {
      setViewport(null);
      return;
    }
    const update = () => setViewport(readViewport(map));
    update();
    map.on("move", update);
    return () => map.off("move", update);
  }, [map]);

  return viewport;
}
