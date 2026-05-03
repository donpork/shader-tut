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
  /** Scales bevel shading that keys off `lightDirXY` (0 = flat, 1 ≈ stock). */
  keyLightIntensity: number;
  /** Z component of key light before `normalize` (higher = more frontal / less grazing in XY). */
  keyLightZ: number;
  /** Specular direction in XY (normalized with z in shader). */
  specularLightXY: [number, number];
  /** When true, specular direction tracks pointer position. */
  specularFollowPointer: boolean;
  specularPower: number;
  specularIntensity: number;
  /** Fresnel exponent on view dot normal: higher = tighter highlight at grazing edges. */
  rimPower: number;
  /** Bright additive rim where Fresnel is high (edge glow). */
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
  /**
   * Where chromatic blur appears vs Fresnel: 0 = broader (visible toward face center),
   * 1 = tighter (mostly at glancing silhouette).
   */
  dispersionFocus: number;
  /** Scales cubemap reflection term (still Fresnel-weighted inside the shader). */
  envReflection: number;
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

/** Click-triggered one-shot modulation envelope for spec params; independent from orbit direction timing. */
export type SpecularModulationState = {
  cellId: string;
  startTimeMs: number;
  peakTimeMs: number;
  decayMs: number;
  peakSpecularIntensityMul: number;
  peakSpecularPowerMul: number;
};

export type SceneData = {
  /** Screen space, origin top-left of the scene (canvas) */
  lightPos: { x: number; y: number };
  /** True while the pointer is inside a cell-surface hit region (for bgLayer cursor reflection). */
  pointerOverSurface: boolean;
  /** True while left pointer button is held down on a cell surface. */
  rimHoldPointerDown: boolean;
  /** Active cell id for rim hold timing. */
  rimHoldCellId: string | null;
  /** performance.now() start time for active rim hold; null when inactive. */
  rimHoldStartTimeMs: number | null;
  /** Cell id currently decaying rim hold after release; null when inactive. */
  rimReleaseCellId: string | null;
  /** performance.now() release start time for rim decay; null when inactive. */
  rimReleaseStartTimeMs: number | null;
  /** Rim multiplier at release start (decays back to 1x). */
  rimReleaseFromMul: number | null;
  /** Release path mode: long-hold decay or short-click pulse+decay. */
  rimReleaseMode: "hold" | "shortClick" | null;
  /** Ramp-up duration for short-click pulse before decay starts. */
  rimShortPulseRampMs: number | null;
  cellRects: CellRect[];
  containerRects: CellRect[];
  cellLabels: string[][];
  glassParams: GlassParams;
  /** When set, that cell’s spec direction rotates once from start direction; sketch clears when done. */
  specularSpin: SpecularSpinState | null;
  /** When set, that cell’s spec params follow a time envelope (rise to peak, then decay), independent of spin direction. */
  specularModulation: SpecularModulationState | null;
};

