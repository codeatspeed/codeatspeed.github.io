import { describe, expect, it } from "vitest";

import type { Token } from "../../src/domain/document";
import { chooseContextWindow, type TokenMeasurement } from "../../src/lib/reader/context-window";

function token(text: string, pivotIndex = Math.floor(text.length / 2)): Token {
  const graphemes = [...text];
  return {
    text,
    kind: "word",
    graphemes,
    pivotIndex,
    boundaryAfter: "none",
    punctuationAfter: "",
  };
}

function measure(tokenToMeasure: Token, fontScale: number): TokenMeasurement {
  const width = tokenToMeasure.text.length * 10 * fontScale;
  const pivotWidth = 10 * fontScale;
  const beforePivotWidth = tokenToMeasure.pivotIndex * 10 * fontScale;
  return { width, beforePivotWidth, pivotWidth };
}

describe("chooseContextWindow", () => {
  it("selects the largest phrase that fits at the base scale", () => {
    const result = chooseContextWindow({
      left: [token("left"), token("near")],
      active: token("word"),
      right: [token("next"), token("right")],
      phraseSize: 5,
      maxWidth: 160,
      surfaceWidth: 180,
      railX: 90,
      horizontalPadding: 10,
      gapWidth: 5,
      baseFontScale: 1,
      minFontScale: 0.5,
      measure,
    });

    expect(result.mode).toBe("context");
    expect(result.fontScale).toBe(1);
    expect(result.left.map((item) => item.token.text)).toEqual(["near"]);
    expect(result.right.map((item) => item.token.text)).toEqual(["next"]);
  });

  it("removes neighbors before reducing legibility", () => {
    const result = chooseContextWindow({
      left: [token("aaaa"), token("bbbb")],
      active: token("ok"),
      right: [token("cccc"), token("dddd")],
      phraseSize: 5,
      maxWidth: 160,
      surfaceWidth: 180,
      railX: 90,
      horizontalPadding: 10,
      gapWidth: 5,
      baseFontScale: 1,
      minFontScale: 0.5,
      measure,
    });

    expect(result.mode).toBe("context");
    expect(result.fontScale).toBe(1);
    expect(result.left).toHaveLength(1);
    expect(result.right).toHaveLength(1);
  });

  it("falls back to active-word-only focus when neighbors cannot fit", () => {
    const result = chooseContextWindow({
      left: [token("neighbor")],
      active: token("active"),
      right: [token("neighbor")],
      phraseSize: 3,
      maxWidth: 150,
      surfaceWidth: 180,
      railX: 90,
      horizontalPadding: 10,
      gapWidth: 5,
      baseFontScale: 1,
      minFontScale: 0.5,
      measure,
    });

    expect(result.left).toEqual([]);
    expect(result.right).toEqual([]);
    expect(result.fontScale).toBe(1);
  });

  it("marks an oversized word as a long-word hold and keeps all text visible", () => {
    const result = chooseContextWindow({
      left: [],
      active: token("extremelylongword"),
      right: [],
      phraseSize: 1,
      maxWidth: 60,
      surfaceWidth: 200,
      railX: 100,
      horizontalPadding: 10,
      gapWidth: 5,
      baseFontScale: 1,
      minFontScale: 0.5,
      measure,
    });

    expect(result.mode).toBe("long-word-hold");
    expect(result.fontScale).toBe(0.5);
    expect(result.scaleX).toBeLessThanOrEqual(1);
    expect(result.scaleX).toBeGreaterThan(0);
  });

  it("uses pivot-centered bounds and honors rail-side padding", () => {
    const asymmetricActive = token("abcdefghij", 3);
    const result = chooseContextWindow({
      left: [token("wide")],
      active: asymmetricActive,
      right: [],
      phraseSize: 2,
      maxWidth: 120,
      surfaceWidth: 120,
      railX: 50,
      horizontalPadding: 10,
      gapWidth: 5,
      baseFontScale: 1,
      minFontScale: 0.5,
      measure,
    });

    expect(result.left).toEqual([]);
    expect(result.right).toEqual([]);
    expect(result.active.token).toBe(asymmetricActive);
  });
});
