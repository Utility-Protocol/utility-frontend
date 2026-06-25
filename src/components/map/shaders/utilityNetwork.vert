// Utility-network vertex shader.
// Transforms normalized mercator positions by the Mapbox projection matrix and
// forwards the per-vertex color (flow hue + load alpha) to the fragment stage.
// Mirrors the inline shader in UtilityNetworkLayer.ts.

precision highp float;

uniform mat4 u_matrix; // Mapbox projection matrix

attribute vec2 a_pos;   // normalized web-mercator [0,1]
attribute vec4 a_color; // rgba: hue = flow direction, alpha = load status

varying vec4 v_color;
varying float v_along; // distance along the edge, for dash patterns

attribute float a_along;

void main() {
  v_color = a_color;
  v_along = a_along;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}
