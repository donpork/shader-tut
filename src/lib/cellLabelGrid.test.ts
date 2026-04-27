import { describe, expect, it } from "vitest";
import { makeDefaultCellLabels, resizeLabelGrid } from "./cellLabelGrid";

describe("cellLabelGrid", () => {
  it("makeDefaultCellLabels", () => {
    const g = makeDefaultCellLabels(2, 3);
    expect(g).toHaveLength(3);
    expect(g[0]).toEqual(["R1C1", "R1C2"]);
    expect(g[1][0]).toBe("R2C1");
  });

  it("resizeLabelGrid keeps existing and fills", () => {
    const g = makeDefaultCellLabels(2, 2);
    const n = resizeLabelGrid(g, 3, 2, (r, c) => `N${r}${c}`);
    expect(n[0][0]).toBe("R1C1");
    expect(n[0][2]).toBe("N02");
  });
});
