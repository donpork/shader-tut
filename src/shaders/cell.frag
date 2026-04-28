precision highp float;

uniform vec2 uResolution;
uniform sampler2D uBackground;
uniform vec3 uLightDir;
uniform vec4 uCellRect; // x, y, w, h in top-left scene space
uniform float uSpecularPower;
uniform float uSpecularIntensity;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uRefractionStrength;
uniform float uEdgeSoftness;
uniform float uBoxLightEnabled;
uniform float uBoxLightIntensity;
uniform float uBoxLightSoftness;
uniform vec2 uBoxLightSize;
uniform vec2 uBoxLightPos;

varying vec2 vTexCoord;

float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - (halfSize - vec2(radius));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
}

float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

void main() {
  vec2 uv = clamp(vTexCoord, 0.0, 1.0);

  vec2 localPx = (uv - 0.5) * uCellRect.zw;
  vec2 halfSize = 0.5 * uCellRect.zw;
  float cornerRadius = min(halfSize.y, halfSize.x);
  float sdf = sdRoundedRect(localPx, halfSize, cornerRadius);
  if (sdf > 0.0) {
    discard;
  }
  float edgeSoftness = max(uEdgeSoftness, 0.05);
  float mask = 1.0 - smoothstep(-edgeSoftness, 0.0, sdf);

  vec2 centered = vec2(
    localPx.x / max(halfSize.x, 1.0),
    localPx.y / max(halfSize.y, 1.0)
  );
  float r = length(centered);
  float z = sqrt(max(0.0, 1.0 - min(r * r, 1.0)));
  vec3 N = normalize(vec3(centered, z));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 L = normalize(uLightDir);
  vec3 H = normalize(L + V);

  // Use absolute screen-space sampling so each cell refracts the background
  // directly under its drawn position.
  vec2 sceneUV = vec2(
    gl_FragCoord.x / max(uResolution.x, 1.0),
    1.0 - (gl_FragCoord.y / max(uResolution.y, 1.0))
  );

  float nDotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - nDotV, max(uRimPower, 0.01));

  // More realistic: subtle center distortion, stronger toward grazing angles.
  float refractPx = uRefractionStrength * (2.0 + 8.0 * fresnel);
  vec2 refractOffset = (N.xy * refractPx) / max(uResolution, vec2(1.0));
  vec2 refractUV = clamp(sceneUV + refractOffset, 0.001, 0.999);
  vec3 refracted = texture2D(uBackground, refractUV).rgb;

  float nDotH = max(dot(N, H), 0.0);
  float spec = pow(nDotH, max(uSpecularPower, 1.0)) * max(uSpecularIntensity, 0.0);
  spec *= smoothstep(0.08, 0.85, nDotH);
  vec3 crescent = vec3(spec);

  float rimBand = smoothstep(0.52, 0.98, fresnel) * max(uRimIntensity, 0.0);
  vec3 rim = vec3(rimBand);

  vec2 boxHalf = max(uBoxLightSize * 0.5, vec2(0.001));
  float boxDist = sdBox(sceneUV - uBoxLightPos, boxHalf);
  float boxSoft = max(uBoxLightSoftness, 0.001);
  float boxMask = 1.0 - smoothstep(0.0, boxSoft, boxDist);
  float boxFacing = smoothstep(0.15, 1.0, N.z);
  float boxLight = uBoxLightEnabled * boxMask * boxFacing * max(uBoxLightIntensity, 0.0);
  vec3 boxColor = vec3(boxLight);

  vec3 finalColor = refracted + crescent + rim + boxColor;
  finalColor = min(finalColor, vec3(1.0));
  float alpha = clamp((0.58 + rimBand + spec * 0.25 + boxLight * 0.2) * mask, 0.0, 1.0);
  gl_FragColor = vec4(finalColor * alpha, alpha);
}
