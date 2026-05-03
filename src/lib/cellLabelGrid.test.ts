import { describe, expect, it } from "vitest";
import { makeLabelsFromPreset } from "./cellLabelGrid";
import { PRESET_SEQUENTIAL, PRESET_CORNER } from "./layoutPreset";

describe("makeLabelsFromPreset", () => {
  it("generates labels for normal and super cells", () => {
    const labels = makeLabelsFromPreset(PRESET_SEQUENTIAL);
    expect(labels["0-1"]).toBe("R1C2");
    expect(labels["1-1"]).toBe("R2C2"); // Quad super
  });

  it("generates labels for micro sub-cells", () => {
    const labels = makeLabelsFromPreset(PRESET_SEQUENTIAL);
    // (0,0) is µ2v — sub-cells should be labeled with .1 and .2
    expect(labels["0-0-m-0"]).toBe("R1C1.1");
    expect(labels["0-0-m-1"]).toBe("R1C1.2");
  });

  it("skips empty cells", () => {
    const labels = makeLabelsFromPreset(PRESET_CORNER);
    expect(labels["0-0"]).toBeUndefined(); // empty 2×2
  });
});
