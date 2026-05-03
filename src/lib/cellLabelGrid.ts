import type { LayoutPreset } from "./layoutPreset";

/**
 * Generates a label map keyed by cell ID for the given preset.
 * - Normal/super cells: `"r-c"` → `"R(r+1)C(c+1)"` (or cell.label override)
 * - Micro containers: same as above for the outer rect
 * - Micro sub-cells: `"r-c-m-i"` → `"R(r+1)C(c+1).(i+1)"` (or microLabels[i] override)
 * - Empty cells: skipped
 */
export function makeLabelsFromPreset(preset: LayoutPreset): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const cell of preset.cells) {
    if (cell.type === "empty") continue;
    const defaultLabel = `R${cell.row + 1}C${cell.col + 1}`;
    const label = cell.label ?? defaultLabel;
    labels[cell.id] = label;
    if (cell.type === "micro") {
      for (let i = 0; i < (cell.microCount ?? 2); i++) {
        labels[`${cell.id}-m-${i}`] = cell.microLabels?.[i] ?? `${label}.${i + 1}`;
      }
    }
  }
  return labels;
}
