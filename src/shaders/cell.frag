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

varying vec2 vTexCoord;

float sdRoundedRect(vec2 p, vec2 halfSize, float radius) {
  vec2 q = abs(p) - (halfSize - vec2(radius));
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
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

  vec2 fragWorld = uCellRect.xy + uv * uCellRect.zw;
  vec2 sceneUV = fragWorld / max(uResolution, vec2(1.0));

  vec2 refractOffset = N.xy * uRefractionStrength;
  vec2 refractUV = clamp(sceneUV + refractOffset, 0.001, 0.999);
  vec3 refracted = texture2D(uBackground, vec2(refractUV.x, 1.0 - refractUV.y)).rgb;

  float nDotH = max(dot(N, H), 0.0);
  float spec = pow(nDotH, max(uSpecularPower, 1.0)) * max(uSpecularIntensity, 0.0);
  spec *= smoothstep(0.08, 0.85, nDotH);
  vec3 crescent = vec3(spec);

  float nDotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - nDotV, max(uRimPower, 0.01));
  float rimBand = smoothstep(0.52, 0.98, fresnel) * max(uRimIntensity, 0.0);
  vec3 rim = vec3(rimBand);

  vec3 finalColor = refracted + crescent + rim;
  finalColor = min(finalColor, vec3(1.0));
  float alpha = clamp((0.58 + rimBand + spec * 0.25) * mask, 0.0, 1.0);
  gl_FragColor = vec4(finalColor * alpha, alpha);
}
