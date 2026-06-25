"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import {
  GPU_MEMORY_BUDGET_BYTES,
  LOD_DISTANCES,
  type AssetInstance,
  type LODLevel,
} from "@/types/spatial";
import { buildAssetLOD, createCircleSpriteTexture } from "@/components/map/lod/AssetMesh";
import type { LODDistances } from "@/components/map/lod/QuadTree";
import { forwardVector } from "@/utils/cameraMatrix";
import {
  useMapCameraSync,
  type MapLike,
} from "@/hooks/useMapCameraSync";
import type {
  FrustumCullRequest,
  FrustumCullResponse,
} from "@/workers/frustumCull.worker";

/** Map local world (x east, y north, z up) → Three.js (x, y up, z). */
function worldToThree(p: { x: number; y: number; z: number }): THREE.Vector3 {
  return new THREE.Vector3(p.x, p.z, -p.y);
}

export interface ThreeOverlayProps {
  /** The Mapbox map (camera source). */
  map: MapLike | null;
  /** The Mapbox container the Three canvas is overlaid onto. */
  container: HTMLElement | null;
  assets: AssetInstance[];
  enabled?: boolean;
}

/**
 * Three.js overlay composited over the Mapbox WebGL canvas. A transparent,
 * pointer-events-none canvas is absolutely positioned over the map container so
 * Mapbox keeps handling interaction. Each frame the camera is synced from
 * `map.transform`, a worker culls the QuadTree, and the resulting visible assets
 * are rendered at their LOD. A memory watchdog degrades LOD distances when the
 * estimated GPU footprint exceeds the budget.
 */
export function ThreeOverlay({
  map,
  container,
  assets,
  enabled = true,
}: ThreeOverlayProps) {
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lodByIdRef = useRef<Map<string, THREE.LOD>>(new Map());
  const visibleIdsRef = useRef<Set<string>>(new Set());
  const lodDistancesRef = useRef<LODDistances>({ ...LOD_DISTANCES });
  const requestIdRef = useRef(0);

  // --- Renderer / scene lifecycle ----------------------------------------
  useEffect(() => {
    if (!enabled || !container) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    const canvas = renderer.domElement;
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.pointerEvents = "none"; // let Mapbox handle interaction
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 0.6);
    sun.position.set(100, 200, 100);
    scene.add(sun);

    const camera = new THREE.PerspectiveCamera(
      60,
      container.clientWidth / Math.max(1, container.clientHeight),
      1,
      5000
    );

    rendererRef.current = renderer;
    sceneRef.current = scene;
    cameraRef.current = camera;

    const onResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      camera.aspect = container.clientWidth / Math.max(1, container.clientHeight);
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      canvas.remove();
      renderer.dispose();
      rendererRef.current = null;
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [container, enabled]);

  // --- Spawn the frustum-cull worker -------------------------------------
  useEffect(() => {
    if (!enabled) return;
    let worker: Worker;
    try {
      worker = new Worker(
        new URL("../../workers/frustumCull.worker.ts", import.meta.url),
        { type: "module" }
      );
    } catch {
      return; // worker unsupported — overlay simply renders nothing
    }
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<FrustumCullResponse>) => {
      const msg = e.data;
      if (msg.type === "result") {
        const ids = new Set<string>();
        for (const v of msg.visible) {
          ids.add(v.id);
          applyLod(v.id, v.lod);
        }
        // Hide assets that left the visible set.
        for (const id of visibleIdsRef.current) {
          if (!ids.has(id)) {
            const lod = lodByIdRef.current.get(id);
            if (lod) lod.visible = false;
          }
        }
        visibleIdsRef.current = ids;
      }
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [enabled]);

  // --- Load assets into the scene and the worker -------------------------
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const spriteTexture = createCircleSpriteTexture();
    const map_ = lodByIdRef.current;

    for (const asset of assets) {
      const lod = buildAssetLOD(asset.type, { spriteTexture });
      lod.position.copy(worldToThree(asset.position));
      lod.visible = false;
      scene.add(lod);
      map_.set(asset.id, lod);
    }

    const loadMsg: FrustumCullRequest = { type: "load", assets };
    workerRef.current?.postMessage(loadMsg);

    return () => {
      for (const lod of map_.values()) scene.remove(lod);
      map_.clear();
      visibleIdsRef.current.clear();
    };
  }, [assets]);

  // --- Camera sync + render loop -----------------------------------------
  useMapCameraSync({
    map,
    enabled,
    onSync: (cam, viewProjection) => {
      const renderer = rendererRef.current;
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      if (!renderer || !scene || !camera) return;

      // Position/orient the Three camera from the synced Mapbox camera.
      camera.position.copy(worldToThree(cam.position));
      const fwd = forwardVector(cam.heading, cam.pitch);
      camera.lookAt(
        camera.position.x + fwd.x,
        camera.position.y + fwd.z,
        camera.position.z - fwd.y
      );
      camera.updateMatrixWorld();

      // Update each visible LOD against the camera, then render.
      for (const id of visibleIdsRef.current) {
        lodByIdRef.current.get(id)?.update(camera);
      }
      renderer.render(scene, camera);

      maybeDegradeForMemory(renderer);

      // Kick an off-thread cull for the next frame.
      const worker = workerRef.current;
      if (worker) {
        const queryMsg: FrustumCullRequest = {
          type: "query",
          requestId: ++requestIdRef.current,
          viewProjection,
          cameraPosition: cam.position,
          lodDistances: lodDistancesRef.current,
        };
        worker.postMessage(queryMsg);
      }
    },
  });

  function applyLod(id: string, lod: LODLevel): void {
    const obj = lodByIdRef.current.get(id);
    if (!obj) return;
    obj.visible = true;
    void lod; // exact level is chosen by THREE.LOD.update against the camera
  }

  /**
   * Rough GPU-memory watchdog. `renderer.info` exposes counts, not bytes, so we
   * estimate from geometry/texture counts and degrade the LOD0 distance when the
   * estimate crosses the budget (and restore it when it recovers).
   */
  function maybeDegradeForMemory(renderer: THREE.WebGLRenderer): void {
    const { geometries, textures } = renderer.info.memory;
    // Coarse estimate: ~64 KB per geometry, ~256 KB per texture.
    const estimate = geometries * 64 * 1024 + textures * 256 * 1024;
    if (estimate > GPU_MEMORY_BUDGET_BYTES) {
      lodDistancesRef.current = { full: 50, simplified: 200, impostor: 500 };
    } else {
      lodDistancesRef.current = { ...LOD_DISTANCES };
    }
  }

  return null;
}

export default ThreeOverlay;
