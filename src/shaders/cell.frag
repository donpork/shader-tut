precision highp float;

uniform vec2 uResolution;
uniform sampler2D uBackground;
uniform sampler2D uCubeStrip;
uniform float uEnvMix;
uniform vec3 uLightDir;
uniform vec3 uSpecularLightDir;
uniform vec4 uCellRect; // x, y, w, h in top-left scene space
uniform float uSpecularPower;
uniform float uSpecularIntensity;
uniform float uRimPower;
uniform float uRimIntensity;
uniform float uFlatPow;
uniform float uPlateau;
uniform float uRefractionStrength;
uniform float uEdgeSoftness;
uniform float uBevelEnabled;
uniform float uBevelStrength;
uniform float uBevelWidthPx;
uniform float uBevelExponent;
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

vec2 rr_grad(vec2 p, vec2 halfSize, float radius) {
  float e = 1.0;
  float gx =
    sdRoundedRect(p + vec2(e, 0.0), halfSize, radius)
    - sdRoundedRect(p - vec2(e, 0.0), halfSize, radius);
  float gy =
    sdRoundedRect(p + vec2(0.0, e), halfSize, radius)
    - sdRoundedRect(p - vec2(0.0, e), halfSize, radius);
  return vec2(gx, gy) * 0.5;
}

vec3 sampleCubeStrip(vec3 dir) {
  vec3 d = normalize(dir);
  vec3 ad = abs(d);
  float faceIndex = 0.0;
  vec2 faceUV = vec2(0.5);

  // Face order in StandardCubeMap strip: +X, -X, +Y, -Y, +Z, -Z.
  if (ad.x >= ad.y && ad.x >= ad.z) {
    if (d.x > 0.0) {
      faceIndex = 0.0;
      faceUV = vec2(-d.z, d.y) / ad.x;
    } else {
      faceIndex = 1.0;
      faceUV = vec2(d.z, d.y) / ad.x;
    }
  } else if (ad.y >= ad.x && ad.y >= ad.z) {
    if (d.y > 0.0) {
      faceIndex = 2.0;
      faceUV = vec2(d.x, -d.z) / ad.y;
    } else {
      faceIndex = 3.0;
      faceUV = vec2(d.x, d.z) / ad.y;
    }
  } else {
    if (d.z > 0.0) {
      faceIndex = 4.0;
      faceUV = vec2(d.x, d.y) / ad.z;
    } else {
      faceIndex = 5.0;
      faceUV = vec2(-d.x, d.y) / ad.z;
    }
  }

  vec2 uv01 = faceUV * 0.5 + 0.5;
  float faceW = 1.0 / 6.0;
  vec2 atlasUV = vec2((faceIndex + uv01.x) * faceW, uv01.y);
  return texture2D(uCubeStrip, clamp(atlasUV, 0.001, 0.999)).rgb;
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
  float distIn = max(-sdf, 0.0);
  vec2 grad = rr_grad(localPx, halfSize, cornerRadius);
  float gradLen = length(grad);
  vec2 nOut = gradLen > 1e-5 ? grad / gradLen : normalize(localPx + vec2(1e-6));

  float maxInPx = max(min(halfSize.x, halfSize.y), 1.0);
  float dNorm = clamp(distIn / maxInPx, 0.0, 1.0);
  float plateau = clamp(uPlateau, 0.0, 0.8);
  float flatPow = max(uFlatPow, 1.0);
  float t = clamp((dNorm - plateau) / max(1.0 - plateau, 1e-4), 0.0, 1.0);
  // Side tilt from SDF distance: removes center-radius taper and respects flat controls.
  float side = pow(1.0 - t, flatPow);
  vec3 N_geom = normalize(vec3(-nOut * side, 1.0));
  vec3 N = N_geom;
  vec3 V = vec3(0.0, 0.0, 1.0);

  // Use absolute screen-space sampling so each cell refracts the background
  // directly under its drawn position.
  vec2 sceneUV = vec2(
    gl_FragCoord.x / max(uResolution.x, 1.0),
    1.0 - (gl_FragCoord.y / max(uResolution.y, 1.0))
  );

  vec3 L_base = normalize(uLightDir);
  vec3 L_spec = normalize(uSpecularLightDir);
  vec3 H = normalize(L_spec + V);

  // Blinn-Phong specular: keep original artistic control while respecting the shape-aware normal field.
  float nDotH = max(dot(N, H), 0.0);
  float spec = pow(nDotH, max(uSpecularPower, 1.0)) * max(uSpecularIntensity, 0.0);
  float specFace = smoothstep(0.0, 0.16, N.z);
  spec *= specFace;

  float nDotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - nDotV, max(uRimPower, 0.01));

  // More realistic: subtle center distortion, stronger toward grazing angles.
  float refractPx = uRefractionStrength * (2.0 + 8.0 * fresnel);
  vec2 refractOffset = (N.xy * refractPx) / max(uResolution, vec2(1.0));
  vec2 refractUV = clamp(sceneUV + refractOffset, 0.001, 0.999);
  vec3 singleSampleColor = texture2D(uBackground, refractUV).rgb;
  // Only spend the extra RGB split refraction cost near high-Fresnel silhouettes.
  float dispersionWeight = smoothstep(0.3, 0.8, fresnel);
  float dispPx = refractPx * 0.22;
  vec2 dispDir = normalize(N.xy + vec2(1e-6));
  vec2 dispStep = (dispDir * dispPx) / max(uResolution, vec2(1.0));
  vec3 tripleDispersionColor = vec3(
    texture2D(uBackground, clamp(sceneUV + refractOffset - dispStep, 0.001, 0.999)).r,
    texture2D(uBackground, clamp(sceneUV + refractOffset, 0.001, 0.999)).g,
    texture2D(uBackground, clamp(sceneUV + refractOffset + dispStep, 0.001, 0.999)).b
  );
  vec3 refracted = mix(singleSampleColor, tripleDispersionColor, dispersionWeight);
  // Global-space cubemap lookup: all cells use the same world-space env.
  vec2 sceneN = sceneUV * 2.0 - 1.0;
  vec3 worldV = normalize(vec3(sceneN.x, -sceneN.y, 1.35));
  vec3 worldR = reflect(-worldV, N);
  vec3 envColor = sampleCubeStrip(worldR);

  vec3 crescent = vec3(spec);

  float rimBand = smoothstep(0.52, 0.98, fresnel) * max(uRimIntensity, 0.0);
  vec3 rim = vec3(rimBand);
  vec3 envSpec = envColor * (0.3 + 0.7 * fresnel) * uEnvMix;

  vec2 boxHalf = max(uBoxLightSize * 0.5, vec2(0.001));
  float boxDist = sdBox(sceneUV - uBoxLightPos, boxHalf);
  float boxSoft = max(uBoxLightSoftness, 0.001);
  float boxMask = 1.0 - smoothstep(0.0, boxSoft, boxDist);
  float boxFacing = smoothstep(0.15, 1.0, N.z);
  float boxLight = uBoxLightEnabled * boxMask * boxFacing * max(uBoxLightIntensity, 0.0);
  vec3 boxColor = vec3(boxLight);

  vec3 bevelTint = vec3(0.0);
  if (uBevelEnabled > 0.5) {
    float w = max(uBevelWidthPx, 0.5);
    float expRim = exp(-uBevelExponent * distIn / w);
    vec2 Lxy = normalize(L_base.xy + vec2(1e-6));
    float facing = dot(Lxy, -nOut);
    float edgeAmt = facing * expRim * uBevelStrength;
    bevelTint = vec3(edgeAmt * 0.65);
    bevelTint *= mask;
  }

  vec3 finalColor =
    refracted
    + crescent
    + rim
    + envSpec
    + boxColor
    + bevelTint;
  finalColor = min(finalColor, vec3(1.0));
  float alpha = clamp(
    (
      0.46
      + rimBand
      + spec * 0.25
      + boxLight * 0.2
    ) * mask,
    0.0,
    1.0
  );
  gl_FragColor = vec4(finalColor * alpha, alpha);
}
