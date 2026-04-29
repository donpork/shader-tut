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
  /** When true, adds a soft box highlight centered on the pointer. */
  lightFollowPointer: boolean;
  pointerBoxIntensity: number;
  pointerBoxSoftness: number;
  pointerBoxSize: [number, number];
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

export type SceneData = {
  /** Screen space, origin top-left of the scene (canvas) */
  lightPos: { x: number; y: number };
  cellRects: CellRect[];
  containerRects: CellRect[];
  cellLabels: string[][];
  glassParams: GlassParams;
};

