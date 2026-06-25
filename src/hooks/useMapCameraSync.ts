"use client";

import { useEffect, useRef } from "react";
import { buildViewProjection, mercatorMeters, type Mat4 } from "@/utils/cameraMatrix";
import type { CameraState } from "@/types/spatial";

/**
 * Synchronizes a Three.js overlay camera with the Mapbox camera every animation
 * frame. It reads `map.transform` (center, elevation, bearing, pitch), maps the
 * mercator center into local world meters, and builds a view-projection matrix
 * that the frustum-culling layer consumes.
 *
 * The Mapbox dependency is expressed via a minimal structural interface so the
 * hook can be driven with a fake map and a fake rAF in tests.
 */

export interface MapTransformLike {
  _center?: { lng: number; lat: number };
  center?: { lng: number; lat: number };
  _elevation?: number;
  elevation?: number;
  /** Bearing / heading, degrees. */
  bearing: number;
  /** Pitch, degrees. */
  pitch: number;
  width: number;
  height: number;
}

export interface MapLike {
  transform: MapTransformLike;
}

export interface UseMapCameraSyncOptions {
  map: MapLike | null;
  /** Receives the camera state and column-major view-projection each frame. */
  onSync: (camera: CameraState, viewProjection: Mat4) => void;
  enabled?: boolean;
  /** Injectable rAF (tests). */
  raf?: (cb: FrameRequestCallback) => number;
  /** Injectable cancel (tests). */
  cancelRaf?: (handle: number) => void;
}

function centerOf(t: MapTransformLike): { lng: number; lat: number } {
  return t._center ?? t.center ?? { lng: 0, lat: 0 };
}

function elevationOf(t: MapTransformLike): number {
  return t._elevation ?? t.elevation ?? 0;
}

/** Pure: derive the camera state from a transform, relative to a world origin. */
export function readCameraState(
  t: MapTransformLike,
  origin: { lng: number; lat: number }
): CameraState {
  const center = centerOf(t);
  const altitude = elevationOf(t);
  const { x, y } = mercatorMeters(center.lng, center.lat, origin);
  return {
    position: { x, y, z: altitude },
    longitude: center.lng,
    latitude: center.lat,
    altitude,
    heading: t.bearing,
    pitch: t.pitch,
  };
}

/** Pure: build the view-projection for a transform relative to an origin. */
export function viewProjectionForTransform(
  t: MapTransformLike,
  origin: { lng: number; lat: number }
): { camera: CameraState; viewProjection: Mat4 } {
  const camera = readCameraState(t, origin);
  const aspect = t.height > 0 ? t.width / t.height : 1;
  const viewProjection = buildViewProjection({
    position: camera.position,
    heading: camera.heading,
    pitch: camera.pitch,
    aspect,
  });
  return { camera, viewProjection };
}

export function useMapCameraSync(options: UseMapCameraSyncOptions): void {
  const { map, onSync, enabled = true } = options;

  const onSyncRef = useRef(onSync);
  onSyncRef.current = onSync;
  /** World origin (lng/lat of the first observed center), fixed for the session. */
  const originRef = useRef<{ lng: number; lat: number } | null>(null);

  useEffect(() => {
    if (!enabled || !map) return;
    const raf =
      options.raf ??
      (typeof requestAnimationFrame !== "undefined"
        ? requestAnimationFrame
        : null);
    const cancel =
      options.cancelRaf ??
      (typeof cancelAnimationFrame !== "undefined" ? cancelAnimationFrame : null);
    if (!raf) return;

    let handle = 0;
    let stopped = false;

    const frame = () => {
      if (stopped) return;
      const t = map.transform;
      if (t) {
        if (originRef.current === null) {
          originRef.current = centerOf(t);
        }
        const { camera, viewProjection } = viewProjectionForTransform(
          t,
          originRef.current
        );
        onSyncRef.current(camera, viewProjection);
      }
      handle = raf(frame);
    };

    handle = raf(frame);
    return () => {
      stopped = true;
      if (cancel) cancel(handle);
    };
    // raf/cancelRaf are read once at effect start; map/enabled drive re-runs.
  }, [map, enabled, options.raf, options.cancelRaf]);
}
