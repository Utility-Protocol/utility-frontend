/**
 * Three.js mesh factory for utility assets with built-in Level-of-Detail.
 *
 * Each asset type maps to a {@link THREE.LOD} carrying three representations:
 *   - LOD0: a detailed mesh (an injected GLTF scene, or a beveled box fallback)
 *   - LOD1: a simplified box
 *   - LOD2: a billboarded impostor sprite
 * Beyond the impostor distance an empty level hides the asset.
 *
 * Identical asset types are also offered as a single {@link THREE.InstancedMesh}
 * to collapse thousands of draw calls into one.
 */

import * as THREE from "three";
import {
  LOD_DISTANCES,
  type AssetInstance,
  type AssetType,
} from "@/types/spatial";

interface AssetTemplate {
  color: number;
  /** Box half-extents (meters): width, height, depth. */
  size: [number, number, number];
}

const ASSET_TEMPLATES: Record<AssetType, AssetTemplate> = {
  meter: { color: 0x22c55e, size: [1, 2, 1] },
  valve: { color: 0xf59e0b, size: [1.5, 1, 1.5] },
  substation: { color: 0xef4444, size: [6, 4, 6] },
};

/** Generate a soft circular texture for impostor sprites. */
export function createCircleSpriteTexture(size = 64): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const r = size / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.7, "rgba(255,255,255,0.9)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  return new THREE.CanvasTexture(canvas);
}

function detailedBox(template: AssetTemplate): THREE.Mesh {
  const [w, h, d] = template.size;
  const geometry = new THREE.BoxGeometry(w, h, d, 2, 2, 2);
  const material = new THREE.MeshStandardMaterial({
    color: template.color,
    roughness: 0.6,
    metalness: 0.1,
  });
  return new THREE.Mesh(geometry, material);
}

function simplifiedBox(template: AssetTemplate): THREE.Mesh {
  const [w, h, d] = template.size;
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshBasicMaterial({ color: template.color });
  return new THREE.Mesh(geometry, material);
}

function impostorSprite(
  template: AssetTemplate,
  texture: THREE.Texture | null
): THREE.Sprite {
  const material = new THREE.SpriteMaterial({
    color: template.color,
    map: texture ?? undefined,
    sizeAttenuation: true,
  });
  const sprite = new THREE.Sprite(material);
  const scale = Math.max(...template.size);
  sprite.scale.set(scale, scale, 1);
  return sprite;
}

export interface BuildLODOptions {
  /** Detailed LOD0 object (e.g. a loaded GLTF scene). Falls back to a box. */
  lod0?: THREE.Object3D;
  /** Shared sprite texture for impostors. */
  spriteTexture?: THREE.Texture | null;
}

/**
 * Build a {@link THREE.LOD} for an asset type. Level distances match the
 * {@link LOD_DISTANCES} invariants; an empty level past the impostor distance
 * hides the asset entirely.
 */
export function buildAssetLOD(
  type: AssetType,
  options: BuildLODOptions = {}
): THREE.LOD {
  const template = ASSET_TEMPLATES[type];
  const lod = new THREE.LOD();

  lod.addLevel(options.lod0 ?? detailedBox(template), 0);
  lod.addLevel(simplifiedBox(template), LOD_DISTANCES.full);
  lod.addLevel(impostorSprite(template, options.spriteTexture ?? null), LOD_DISTANCES.simplified);
  // Empty object beyond the impostor distance → culled.
  lod.addLevel(new THREE.Object3D(), LOD_DISTANCES.impostor);

  return lod;
}

/**
 * Create one {@link THREE.InstancedMesh} for many identical assets of a type,
 * baking each instance's position/rotation/scale into the instance matrix.
 */
export function createInstancedMeshes(
  type: AssetType,
  instances: AssetInstance[]
): THREE.InstancedMesh {
  const template = ASSET_TEMPLATES[type];
  const [w, h, d] = template.size;
  const geometry = new THREE.BoxGeometry(w, h, d);
  const material = new THREE.MeshStandardMaterial({ color: template.color });
  const mesh = new THREE.InstancedMesh(geometry, material, instances.length);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);

  instances.forEach((inst, i) => {
    position.set(inst.position.x, inst.position.z, -inst.position.y);
    quaternion.setFromAxisAngle(up, inst.rotation ?? 0);
    const s = inst.scale ?? 1;
    scale.set(s, s, s);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(i, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}
