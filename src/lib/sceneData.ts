export type CellRect = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export type SceneData = {
  /** Screen space, origin top-left of the scene (canvas) */
  lightPos: { x: number; y: number };
  cellRects: CellRect[];
};

