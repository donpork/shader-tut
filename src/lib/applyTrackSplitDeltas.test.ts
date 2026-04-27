import { describe, expect, it } from "vitest";
import { applyAxisPixelDelta, renormalizeToSum } from "./applyTrackSplitDeltas";

const m = 20;
const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);

describe("applyAxisPixelDelta (cascade)", () => {
  it("positive: moves mass from i+1 into i", () => {
    const w = [100, 100, 100];
    const o = applyAxisPixelDelta(w, 0, 30, m);
    expect(o[0]).toBe(130);
    expect(o[1]).toBe(70);
    expect(o[2]).toBe(100);
    expect(sum(o)).toBe(300);
  });

  it("positive: cascades to the right when i+1 hits m", () => {
    const w = [100, 24, 176];
    const o = applyAxisPixelDelta(w, 0, 200, 20);
    expect(o[0]).toBe(260);
    expect(o[1]).toBe(20);
    expect(o[2]).toBe(20);
    expect(sum(o)).toBe(300);
  });

  it("negative: moves mass from i into i+1", () => {
    const w = [100, 100, 100];
    const o = applyAxisPixelDelta(w, 0, -30, m);
    expect(o[0]).toBe(70);
    expect(o[1]).toBe(130);
    expect(o[2]).toBe(100);
    expect(sum(o)).toBe(300);
  });

  it("negative: when w[i] is m, takes from w[i+2] to grow w[i+1]", () => {
    const w = [20, 100, 100];
    const o = applyAxisPixelDelta(w, 0, -50, 20);
    expect(o[0]).toBe(20);
    expect(o[1]).toBe(150);
    expect(o[2]).toBe(50);
    expect(sum(o)).toBe(220);
  });

  it("negative: when w[i] is m, takes from the left (i-1…) into w[i+1]", () => {
    const w = [200, 20, 100, 100];
    const o = applyAxisPixelDelta(w, 1, -100, 20);
    expect(o[0]).toBe(100);
    expect(o[1]).toBe(20);
    expect(o[2]).toBe(200);
    expect(o[3]).toBe(100);
    expect(sum(o)).toBe(420);
  });

  it("ignores out-of-range split index", () => {
    const w = [50, 50];
    const o = applyAxisPixelDelta(w, 1, 10, 20);
    expect(o).toEqual([50, 50]);
  });
});

describe("renormalizeToSum", () => {
  it("scales to target", () => {
    const a = renormalizeToSum([1, 1, 1], 9);
    expect(sum(a)).toBeCloseTo(9);
  });
});
