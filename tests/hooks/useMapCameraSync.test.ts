import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useMapCameraSync,
  readCameraState,
  viewProjectionForTransform,
  type MapTransformLike,
  type MapLike,
} from "@/hooks/useMapCameraSync";

function transform(over: Partial<MapTransformLike> = {}): MapTransformLike {
  return {
    _center: { lng: 0, lat: 0 },
    _elevation: 100,
    bearing: 0,
    pitch: 0,
    width: 800,
    height: 600,
    ...over,
  };
}

describe("readCameraState", () => {
  it("maps the transform to a world-space camera state", () => {
    const state = readCameraState(transform(), { lng: 0, lat: 0 });
    expect(state.position).toEqual({ x: 0, y: 0, z: 100 });
    expect(state.altitude).toBe(100);
    expect(state.heading).toBe(0);
  });

  it("offsets position relative to the origin", () => {
    const state = readCameraState(
      transform({ _center: { lng: 0.01, lat: 0 } }),
      { lng: 0, lat: 0 }
    );
    expect(state.position.x).toBeGreaterThan(0);
  });

  it("falls back to non-underscore fields", () => {
    const t: MapTransformLike = {
      center: { lng: 1, lat: 1 },
      elevation: 50,
      bearing: 30,
      pitch: 45,
      width: 100,
      height: 100,
    };
    const state = readCameraState(t, { lng: 1, lat: 1 });
    expect(state.altitude).toBe(50);
    expect(state.heading).toBe(30);
    expect(state.pitch).toBe(45);
  });
});

describe("viewProjectionForTransform", () => {
  it("returns a camera state and a 16-element matrix", () => {
    const { camera, viewProjection } = viewProjectionForTransform(transform(), {
      lng: 0,
      lat: 0,
    });
    expect(camera.position.z).toBe(100);
    expect(viewProjection).toHaveLength(16);
  });
});

describe("useMapCameraSync", () => {
  it("invokes onSync each scheduled frame", () => {
    const onSync = vi.fn();
    let frameCb: FrameRequestCallback | null = null;
    const raf = vi.fn((cb: FrameRequestCallback) => {
      frameCb = cb;
      return 1;
    });
    const cancelRaf = vi.fn();
    const map: MapLike = { transform: transform() };

    renderHook(() =>
      useMapCameraSync({ map, onSync, raf, cancelRaf })
    );

    expect(raf).toHaveBeenCalledTimes(1);
    // Drive one frame.
    frameCb!(0);
    expect(onSync).toHaveBeenCalledTimes(1);
    const [camera, vp] = onSync.mock.calls[0];
    expect(camera.altitude).toBe(100);
    expect(vp).toHaveLength(16);
  });

  it("cancels the loop on unmount", () => {
    const cancelRaf = vi.fn();
    const raf = vi.fn(() => 7);
    const map: MapLike = { transform: transform() };
    const { unmount } = renderHook(() =>
      useMapCameraSync({ map, onSync: vi.fn(), raf, cancelRaf })
    );
    unmount();
    expect(cancelRaf).toHaveBeenCalledWith(7);
  });

  it("does nothing without a map", () => {
    const raf = vi.fn();
    renderHook(() =>
      useMapCameraSync({ map: null, onSync: vi.fn(), raf })
    );
    expect(raf).not.toHaveBeenCalled();
  });
});
