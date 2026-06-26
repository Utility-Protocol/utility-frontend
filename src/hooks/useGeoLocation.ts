"use client";

import { useEffect, useRef, useState } from "react";
import type { GeoSample } from "@/types/tile";

/**
 * Watches `navigator.geolocation` (≈1 Hz) and exposes the latest GPS sample with
 * heading and speed — the inputs the prefetch scheduler uses to predict the
 * operator's viewport trajectory.
 */

export interface UseGeoLocationOptions {
  enabled?: boolean;
  /** Injectable geolocation source (tests). */
  geolocation?: Pick<Geolocation, "watchPosition" | "clearWatch">;
  positionOptions?: PositionOptions;
}

export interface UseGeoLocationResult {
  sample: GeoSample | null;
  error: string | null;
  supported: boolean;
}

/** Map a browser GeolocationPosition into our GeoSample. */
export function toGeoSample(position: GeolocationPosition): GeoSample {
  const { coords, timestamp } = position;
  return {
    lng: coords.longitude,
    lat: coords.latitude,
    heading: Number.isFinite(coords.heading) ? coords.heading : null,
    speed: Number.isFinite(coords.speed) ? coords.speed : null,
    timestamp,
  };
}

export function useGeoLocation(
  options: UseGeoLocationOptions = {}
): UseGeoLocationResult {
  const { enabled = true } = options;
  const geo =
    options.geolocation ??
    (typeof navigator !== "undefined" ? navigator.geolocation : undefined);

  const [sample, setSample] = useState<GeoSample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const optsRef = useRef(options.positionOptions);
  optsRef.current = options.positionOptions;

  useEffect(() => {
    if (!enabled || !geo) return;
    const watchId = geo.watchPosition(
      (position) => {
        setSample(toGeoSample(position));
        setError(null);
      },
      (err) => setError(err.message),
      optsRef.current ?? { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
    return () => geo.clearWatch(watchId);
  }, [enabled, geo]);

  return { sample, error, supported: !!geo };
}
