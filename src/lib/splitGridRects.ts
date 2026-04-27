import type { CellRect } from "./sceneData";

function sumFracs(fracs: readonly number[]): number {
  return fracs.reduce((a, f) => a + f, 0);
}

/** Pixel rects for a track grid; row-major ids `${row}-${col}`. Fracs are normalized. */
export function splitGridRects(
  colFracs: readonly number[],
  rowFracs: readonly number[],
  w: number,
  h: number
): CellRect[] {
  if (w <= 0 || h <= 0) return [];
  const c = colFracs.length;
  const r = rowFracs.length;
  if (c < 1 || r < 1) return [];
  const cs = sumFracs(colFracs);
  const rs = sumFracs(rowFracs);
  const cF = colFracs.map((f) => f / cs);
  const rF = rowFracs.map((f) => f / rs);
  const out: CellRect[] = [];
  let y = 0;
  for (let row = 0; row < r; row++) {
    const ch = rF[row] * h;
    let x = 0;
    for (let col = 0; col < c; col++) {
      const cw = cF[col] * w;
      out.push({ id: `${row}-${col}`, x, y, w: cw, h: ch });
      x += cw;
    }
    y += ch;
  }
  return out;
}
