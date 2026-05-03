export type MicroSplit = "h" | "v";
export type LayoutOrdering = "sequential" | "organized" | "fixed";

export type LayoutCellDef = {
  /** Derived from row/col: `"row-col"`. Micro sub-cells append `"-m-0"`, `"-m-1"`, etc. */
  id: string;
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  type: "normal" | "super" | "micro" | "empty";
  /** Only for micro cells: number of sub-divisions. */
  microCount?: 2 | 3;
  /** Only for micro cells: direction sub-cells are split. */
  microSplit?: MicroSplit;
  /** Override the auto-generated label for normal/super/micro container cells. */
  label?: string;
  /** Override labels for each micro sub-cell. Length must equal microCount. */
  microLabels?: string[];
};

export type LayoutPreset = {
  name: string;
  ordering: LayoutOrdering;
  /** 3–5 */
  cols: number;
  /** 3–5 */
  rows: number;
  cells: LayoutCellDef[];
};

function c(
  row: number,
  col: number,
  rowSpan: number,
  colSpan: number,
  type: LayoutCellDef["type"],
  opts: Pick<LayoutCellDef, "microCount" | "microSplit" | "label" | "microLabels"> = {}
): LayoutCellDef {
  return { id: `${row}-${col}`, row, col, rowSpan, colSpan, type, ...opts };
}

/**
 * Sequential (4×4)
 * Micros at top corners → normals in the middle band → supers dominate the bottom-right.
 * Max-2-adjacent-normals: verified ✓
 */
export const PRESET_SEQUENTIAL: LayoutPreset = {
  name: "Sequential",
  ordering: "sequential",
  cols: 4,
  rows: 4,
  cells: [
    c(0, 0, 1, 1, "micro", { microCount: 2, microSplit: "v" }),
    c(0, 1, 1, 1, "normal"),
    c(0, 2, 1, 1, "normal"),
    c(0, 3, 1, 1, "micro", { microCount: 2, microSplit: "h" }),
    c(1, 0, 1, 1, "normal"),
    c(1, 1, 2, 2, "super"),   // Quad
    c(1, 3, 1, 1, "normal"),
    c(2, 0, 2, 1, "super"),   // S2v — structural, breaks col-0 normal run
    c(2, 3, 1, 1, "normal"),
    c(3, 1, 1, 3, "super"),   // S3h
  ],
};

/**
 * Organized (4×4)
 * Quad and S3h share a grid edge (proximal). Micros distributed in bottom corners.
 * Max-2-adjacent-normals: verified ✓
 */
export const PRESET_ORGANIZED: LayoutPreset = {
  name: "Organized",
  ordering: "organized",
  cols: 4,
  rows: 4,
  cells: [
    c(0, 0, 1, 1, "normal"),
    c(0, 1, 1, 1, "normal"),
    c(0, 2, 2, 2, "super"),   // Quad
    c(1, 0, 1, 1, "normal"),
    c(1, 1, 1, 1, "normal"),
    c(2, 0, 1, 3, "super"),   // S3h — shares row-1/2 boundary with Quad
    c(2, 3, 1, 1, "normal"),
    c(3, 0, 1, 1, "micro", { microCount: 2, microSplit: "h" }),
    c(3, 1, 1, 1, "normal"),
    c(3, 2, 1, 1, "normal"),
    c(3, 3, 1, 1, "micro", { microCount: 2, microSplit: "v" }),
  ],
};

/**
 * Fixed (4×4)
 * R1C1 normal. S3h anchors top-right. Quad center. Both micros on bottom row.
 * Max-2-adjacent-normals: verified ✓
 */
export const PRESET_FIXED: LayoutPreset = {
  name: "Fixed",
  ordering: "fixed",
  cols: 4,
  rows: 4,
  cells: [
    c(0, 0, 1, 1, "normal"),  // R1C1 always normal
    c(0, 1, 1, 3, "super"),   // S3h
    c(1, 0, 2, 1, "super"),   // S2v — structural
    c(1, 1, 2, 2, "super"),   // Quad
    c(1, 3, 1, 1, "normal"),
    c(2, 3, 1, 1, "normal"),
    c(3, 0, 1, 1, "normal"),
    c(3, 1, 1, 1, "micro", { microCount: 2, microSplit: "h" }),
    c(3, 2, 1, 1, "normal"),
    c(3, 3, 1, 1, "micro", { microCount: 2, microSplit: "v" }),
  ],
};

/**
 * Corner (4×4)
 * Empty 2×2 cuts the top-left corner. S3v runs down the right side of the gap.
 * Empty cell is on row-0 and col-0 outer edges ✓. Max-2-adjacent-normals: verified ✓
 */
export const PRESET_CORNER: LayoutPreset = {
  name: "Corner",
  ordering: "organized",
  cols: 4,
  rows: 4,
  cells: [
    c(0, 0, 2, 2, "empty"),   // empty 2×2 top-left corner
    c(0, 2, 3, 1, "super"),   // S3v
    c(0, 3, 1, 1, "normal"),
    c(1, 3, 1, 1, "normal"),
    c(2, 0, 2, 2, "super"),   // Quad
    c(2, 3, 1, 1, "micro", { microCount: 2, microSplit: "v" }),
    c(3, 2, 1, 1, "micro", { microCount: 2, microSplit: "h" }),
    c(3, 3, 1, 1, "normal"),
  ],
};

/**
 * Notch (4 cols × 5 rows)
 * Empty 2×2 cuts the bottom-left corner. Demonstrates varied row count (5 rows).
 * Empty cell is on row-4 and col-0 outer edges ✓. Max-2-adjacent-normals: verified ✓
 */
export const PRESET_NOTCH: LayoutPreset = {
  name: "Notch",
  ordering: "sequential",
  cols: 4,
  rows: 5,
  cells: [
    c(0, 0, 1, 1, "normal"),
    c(0, 1, 1, 3, "super"),   // S3h
    c(1, 0, 1, 1, "micro", { microCount: 2, microSplit: "v" }),
    c(1, 1, 1, 1, "normal"),
    c(1, 2, 2, 2, "super"),   // Quad
    c(2, 0, 1, 1, "normal"),
    c(2, 1, 1, 1, "micro", { microCount: 2, microSplit: "h" }),
    c(3, 0, 2, 2, "empty"),   // empty 2×2 bottom-left notch
    c(3, 2, 1, 1, "normal"),
    c(3, 3, 1, 1, "normal"),
    c(4, 2, 1, 1, "normal"),
    c(4, 3, 1, 1, "normal"),
  ],
};

/**
 * Side Cut (5 cols × 4 rows)
 * Full-height empty strip on the right edge. Demonstrates varied column count (5 cols).
 * Empty cell spans all 4 rows of col-4 (rightmost edge) ✓. Max-2-adjacent-normals: verified ✓
 */
export const PRESET_SIDE_CUT: LayoutPreset = {
  name: "Side Cut",
  ordering: "fixed",
  cols: 5,
  rows: 4,
  cells: [
    c(0, 0, 1, 3, "super"),   // S3h
    c(0, 3, 1, 1, "normal"),
    c(0, 4, 4, 1, "empty"),   // full-height empty right column
    c(1, 0, 1, 1, "micro", { microCount: 2, microSplit: "v" }),
    c(1, 1, 1, 1, "normal"),
    c(1, 2, 2, 2, "super"),   // Quad
    c(2, 0, 1, 1, "normal"),
    c(2, 1, 1, 1, "micro", { microCount: 2, microSplit: "h" }),
    c(3, 0, 1, 1, "normal"),
    c(3, 1, 1, 1, "normal"),
    c(3, 2, 1, 2, "super"),   // S2h — structural, breaks row-3 normal run
  ],
};

export const ALL_PRESETS: LayoutPreset[] = [
  PRESET_SEQUENTIAL,
  PRESET_ORGANIZED,
  PRESET_FIXED,
  PRESET_CORNER,
  PRESET_NOTCH,
  PRESET_SIDE_CUT,
];
