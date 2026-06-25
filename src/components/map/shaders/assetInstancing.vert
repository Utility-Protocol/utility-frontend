// Instanced vertex shader for rendering many identical utility-asset meshes
// with per-instance position, rotation (about the world-up axis) and scale.
//
// `instanceMatrix` is provided automatically by THREE.InstancedMesh; the
// per-instance attributes below are an alternative, more compact path when the
// transform is a simple position + yaw + uniform scale.

precision highp float;

// Standard Three.js uniforms.
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;

// Per-vertex attributes.
attribute vec3 position;
attribute vec3 normal;

// Per-instance attributes (set via InstancedBufferAttribute).
attribute vec3 instancePosition; // world offset (meters)
attribute float instanceRotation; // yaw about +Y, radians
attribute float instanceScale; // uniform scale

varying vec3 vNormal;

mat3 rotationY(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat3(
    c, 0.0, -s,
    0.0, 1.0, 0.0,
    s, 0.0, c
  );
}

void main() {
  mat3 rot = rotationY(instanceRotation);
  vec3 local = rot * (position * instanceScale) + instancePosition;
  vNormal = normalize(rot * normal);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
}
