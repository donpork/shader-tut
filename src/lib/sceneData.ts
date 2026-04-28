export type CellRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type GlassParams = {
  lightDirXY: [number, number];
  lightFollowPointer: boolean;
  pointerLightMix: number;
  specularPower: number;
  specularIntensity: number;
  rimPower: number;
  rimIntensity: number;
  refractionStrength: number;
  edgeSoftness: number;
};

export type SceneData = {
  /** Screen space, origin top-left of the scene (canvas) */
  lightPos: { x: number; y: number };
  cellRects: CellRect[];
  containerRects: CellRect[];
  cellLabels: string[][];
  glassParams: GlassParams;
};

