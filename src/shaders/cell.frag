precision highp float;

uniform vec2 uResolution;
uniform vec2 uLightPos;
uniform vec4 uCellRect; // x, y, w, h in top-left scene space
uniform vec3 uGlassTint;
uniform float uSpecularPower;
uniform float uFresnelPower;
uniform float uCausticStrength;
uniform float uBodyDarkness;
uniform float uTime;
uniform float uCellIndex;

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
  if (sdf > 0.0) discard;
  float mask = 1.0 - smoothstep(-1.0, 0.0, sdf);

  vec2 centered = vec2(
    localPx.x / max(halfSize.x, 1.0),
    localPx.y / max(halfSize.y, 1.0)
  );
  float r = length(centered);
  float z = sqrt(max(0.0, 1.0 - min(r * r, 1.0)));
  vec3 N = normalize(vec3(centered, z));
  vec3 V = vec3(0.0, 0.0, 1.0);

  vec2 fragWorld = uCellRect.xy + uv * uCellRect.zw;
  vec2 lightWorld = uLightPos;
  vec2 toLight2D = normalize(lightWorld - fragWorld);
  vec3 L = normalize(vec3(toLight2D, 1.5));

  float nDotV = max(dot(N, V), 0.0);
  float fresnel = pow(1.0 - nDotV, max(uFresnelPower, 0.001));
  vec3 rimColor = uGlassTint * fresnel * 1.2;

  vec3 H = normalize(L + V);
  float nDotH = max(dot(N, H), 0.0);
  float sharpPow = max(uSpecularPower, 1.0);
  float specSharp = pow(nDotH, sharpPow);
  float specSoft = pow(nDotH, max(sharpPow * 0.15, 3.0)) * 0.08;

  float chromaAmount = 0.003;
  vec3 Hr = normalize(L + V + vec3(chromaAmount, 0.0, 0.0));
  vec3 Hb = normalize(L + V + vec3(-chromaAmount, 0.0, 0.0));
  float specR = pow(max(dot(N, Hr), 0.0), sharpPow);
  float specB = pow(max(dot(N, Hb), 0.0), sharpPow);
  vec3 specColor = vec3(
    specSharp + specR * 0.4,
    specSharp + specSoft,
    specSharp + specB * 0.4
  );

  vec3 L2 = normalize(vec3(-toLight2D * 0.6, 1.8));
  vec3 H2 = normalize(L2 + V);
  float nDotH2 = max(dot(N, H2), 0.0);
  float caustic =
    pow(nDotH2, max(sharpPow * 0.5, 6.0)) * clamp(uCausticStrength, 0.0, 1.0);
  vec3 causticColor = caustic * uGlassTint * 0.8;

  float rimLine = smoothstep(1.0, 0.92, r) * smoothstep(0.85, 1.0, r);
  float rimPulse = 0.96 + 0.04 * sin(uTime * 0.9 + uCellIndex * 0.7);
  vec3 rimLineColor = rimLine * uGlassTint * 0.9 * rimPulse;

  float bodyDarkness =
    clamp(uBodyDarkness, 0.0, 0.2) * (1.0 - fresnel) * z * (0.9 + 0.1 * sin(uTime * 0.6));
  vec3 bodyColor = uGlassTint * bodyDarkness;

  vec3 finalColor = bodyColor + rimColor + rimLineColor + specColor + causticColor;
  float litSignal = fresnel * 0.9 + specSharp + caustic + rimLine + bodyDarkness;
  float visibility = smoothstep(0.02, 0.18, litSignal);
  finalColor *= visibility;
  finalColor = min(finalColor, vec3(0.92));

  float alpha = clamp(litSignal * visibility, 0.0, 1.0) * mask;
  gl_FragColor = vec4(finalColor * alpha, alpha);
}
