// Screen space: top-left origin (gl_FragCoord.y flipped). Global light — no per-cell edge mask
// (masking by cell border was zeroing light exactly on the scene’s top/left where the lamp sits).
precision mediump float;
uniform vec2 uResolution;
uniform vec2 uLightPos;

void main() {
  vec2 p = gl_FragCoord.xy;
  p.y = uResolution.y - p.y;

  float d = distance(p, uLightPos);
  float shade = 1.0 / (1.0 + 0.00006 * d * d);
  vec3 base = vec3(0.26, 0.28, 0.32);
  vec3 blueLit = vec3(0.42, 0.62, 1.0);
  vec3 lit = mix(base, blueLit, shade);
  gl_FragColor = vec4(lit, 1.0);
}
