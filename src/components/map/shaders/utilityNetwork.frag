// Utility-network fragment shader.
// Applies the per-vertex color, modulated by a global opacity, with an optional
// dash pattern driven by `u_dash` (dash length, gap length in along-units; set
// the dash length to 0 to disable). Mirrors the inline shader in
// UtilityNetworkLayer.ts.

precision highp float;

varying vec4 v_color;
varying float v_along;

uniform float u_opacity;
uniform vec2 u_dash; // (dashLength, gapLength); dashLength == 0.0 → solid

void main() {
  float alpha = v_color.a * u_opacity;

  if (u_dash.x > 0.0) {
    float period = u_dash.x + u_dash.y;
    float phase = mod(v_along, period);
    if (phase > u_dash.x) {
      discard; // gap
    }
  }

  gl_FragColor = vec4(v_color.rgb, alpha);
}
