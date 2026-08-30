import { describe, expect, it } from "vitest";

import { computePivotOffset } from "../../src/lib/reader/pivot";

describe("computePivotOffset", () => {
  it("places an uneven pivot grapheme center on the rail", () => {
    const offset = computePivotOffset({ beforeWidth: 37, pivotWidth: 11, railX: 120 });

    expect(offset).toBe(77.5);
    expect(offset + 37 + 11 / 2).toBe(120);
  });

  it("uses measured grapheme widths rather than whole-word centering", () => {
    const short = computePivotOffset({ beforeWidth: 8, pivotWidth: 12, railX: 50 });
    const long = computePivotOffset({ beforeWidth: 91, pivotWidth: 7, railX: 50 });

    expect(short).toBe(36);
    expect(long).toBe(-44.5);
    expect(long + 91 + 7 / 2).toBe(50);
  });
});
