export type CellRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type GlassParams = {
  /** Base direction for bevel / rim context (normalized with z in shader). */
  lightDirXY: [number, number];
  /** Specular direction in XY (normalized with z in shader). */
  specularLightXY: [number, number];
  /** When true, specular direction tracks pointer position. */
  specularFollowPointer: boolean;
  specularPower: number;
  specularIntensity: number;
  rimPower: number;
  rimIntensity: number;
  /** Dome profile exponent (>1 flattens center crown). */
  flatPow: number;
  /** Center plateau radius in normalized dome space [0..0.8]. */
  plateau: number;
  refractionStrength: number;
  edgeSoftness: number;
  /** Rotates channel-split CA fringe on the gray axis (radians); ±π cycles hues. */
  dispersionHueShift: number;
  /** How much spectral fringe keeps chroma vs pulled toward gray [0–1]. Higher = more rainbow. */
  dispersionSaturation: number;
  /** Multiplier on spectral sample spacing along the prism axis (wider separation). */
  dispersionSpread: number;
  /** Sharpens per-tap spectral RGB weights; 1 ≈ stock bases, >1 pushes more saturated rainbow separation. */
  dispersionSharpness: number;
  boxLightEnabled: boolean;
  boxLightIntensity: number;
  boxLightSoftness: number;
  boxLightSize: [number, number];
  boxLightPosXY: [number, number];
  /** Fake rim bevel (fragment shading from rounded-rect SDF). */
  bevelEnabled: boolean;
  /** Signed brighten/darken vs light (~0–1). */
  bevelStrength: number;
  /** Falloff distance in px for exp(-exponent * dist/width). */
  bevelWidthPx: number;
  /** Higher = tighter rim hugging the cel edge. */
  bevelExponent: number;
};

/** Click-triggered one-shot specular sweep: full turn in XY, timed in performance.now() ms. */
export type SpecularSpinState = {
  cellId: string;
  startTimeMs: number;
  durationMs: number;
  /** Unit XY direction at t=0 (matches inverted normalized cell-local pointer convention). */
  startSpecDirX: number;
  startSpecDirY: number;
};

export type SceneData = {
  /** Screen space, origin top-left of the scene (canvas) */
  lightPos: { x: number; y: number };
  cellRects: CellRect[];
  containerRects: CellRect[];
  cellLabels: string[][];
  glassParams: GlassParams;
  /** When set, that cell’s spec direction rotates once from start direction; sketch clears when done. */
  specularSpin: SpecularSpinState | null;
};

