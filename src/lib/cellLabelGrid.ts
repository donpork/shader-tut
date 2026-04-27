/** Row-major [row][col] labels, sized to match grid dimensions. */
export type CellLabelGrid = string[][];

export function makeDefaultCellLabels(cols: number, rows: number): CellLabelGrid {
  const out: string[][] = [];
  for (let row = 0; row < rows; row++) {
    const r: string[] = [];
    for (let col = 0; col < cols; col++) {
      r.push(`R${row + 1}C${col + 1}`);
    }
    out.push(r);
  }
  return out;
}

/** Reshape when cols/rows change: keep existing where possible, fill gaps with `filler` default. */
export function resizeLabelGrid(
  prev: CellLabelGrid,
  cols: number,
  rows: number,
  filler: (row: number, col: number) => string
): CellLabelGrid {
  const out: string[][] = [];
  for (let row = 0; row < rows; row++) {
    const r: string[] = [];
    for (let col = 0; col < cols; col++) {
      r.push(prev[row]?.[col] ?? filler(row, col));
    }
    out.push(r);
  }
  return out;
}
