import { describe, expect, it } from "vitest";

import { segmentGraphemes, segmentWords, selectPivotIndex } from "../../src/lib/text/segment";

describe("segmentGraphemes", () => {
  it("keeps combining marks and emoji sequences together", () => {
    expect(segmentGraphemes("cafe\u0301")).toEqual(["c", "a", "f", "e\u0301"]);
    expect(segmentGraphemes("👩🏽‍💻")).toEqual(["👩🏽‍💻"]);
  });

  it("returns an empty array for empty text", () => {
    expect(segmentGraphemes("")).toEqual([]);
  });
});

describe("segmentWords", () => {
  it("separates words, punctuation, and repeated whitespace", () => {
    expect(segmentWords("Hello,  world!\n\n" )).toEqual([
      { text: "Hello", kind: "word" },
      { text: ",", kind: "punctuation" },
      { text: "  ", kind: "whitespace" },
      { text: "world", kind: "word" },
      { text: "!", kind: "punctuation" },
      { text: "\n\n", kind: "whitespace" },
    ]);
  });

  it("does not classify punctuation as a word", () => {
    expect(segmentWords("…?!")).toEqual([{ text: "…?!", kind: "punctuation" }]);
  });

  it("keeps a long compound word as one word segment", () => {
    expect(segmentWords("characteristically" )).toEqual([
      { text: "characteristically", kind: "word" },
    ]);
  });
});

describe("selectPivotIndex", () => {
  it("chooses a deterministic in-bounds pivot", () => {
    for (const graphemes of [[], ["a"], ["a", "b"], ["a", "b", "c", "d", "e"]]) {
      const pivot = selectPivotIndex(graphemes);
      expect(pivot).toBeGreaterThanOrEqual(0);
      expect(pivot).toBeLessThan(Math.max(graphemes.length, 1));
      expect(pivot).toBe(selectPivotIndex(graphemes));
    }
    expect(selectPivotIndex(["r", "e", "a", "d"])).toBe(2);
  });
});
