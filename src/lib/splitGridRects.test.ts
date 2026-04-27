import { describe, expect, it } from "vitest";
import { applyAxisPixelDelta, renormalizeToSum } from "./applyTrackSplitDeltas";
import { splitGridRects } from "./splitGridRects";

describe("splitGridRects with pair-adjusted col tracks", () => {
  it("row-major rects tile w×h and match column fractions", () => {
    const m = 20;
    const W = 200;
    const H = 100;
    const wPx0 = [100, 100];
    const wPx1 = renormalizeToSum(applyAxisPixelDelta(wPx0, 0, 40, m), W);
    const colFr = wPx1.map((x) => x / W);
    const rowFr = [0.5, 0.5];
    const rects = splitGridRects(colFr, rowFr, W, H);
    expect(rects).toHaveLength(4);
    const sumW = (row: 0 | 1) =>
      [0, 1]
        .map((c) => rects.find((r) => r.id === `${row}-${c}`)!.w)
        .reduce((a, b) => a + b, 0);
    expect(sumW(0)).toBeCloseTo(W);
    expect(sumW(1)).toBeCloseTo(W);
  });
});
