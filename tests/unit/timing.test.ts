import { describe, expect, it } from "vitest";

import type { Token } from "../../src/domain/document";
import { DEFAULT_READER_SETTINGS, type ReaderSettings } from "../../src/domain/settings";
import { durationForToken, timingForToken } from "../../src/lib/reader/timing";

const baseInput = {
  wpm: 600,
  punctuationAfter: "",
  boundaryAfter: "none" as Token["boundaryAfter"],
  isLongWord: false,
  pauseProfile: "balanced" as ReaderSettings["pauseProfile"],
};

function word(overrides: Partial<Token> = {}): Token {
  return {
    text: "word",
    kind: "word",
    graphemes: ["w", "o", "r", "d"],
    pivotIndex: 1,
    boundaryAfter: "none",
    punctuationAfter: "",
    ...overrides,
  };
}

describe("durationForToken", () => {
  it("starts with the WPM duration", () => {
    expect(durationForToken(baseInput)).toBe(100);
    expect(durationForToken({ ...baseInput, wpm: 1200 })).toBe(50);
  });

  it("adds punctuation and boundary pauses independently", () => {
    const plain = durationForToken(baseInput);
    const punctuated = durationForToken({ ...baseInput, punctuationAfter: "," });
    const sentence = durationForToken({ ...baseInput, boundaryAfter: "sentence" });
    const both = durationForToken({ ...baseInput, punctuationAfter: ",", boundaryAfter: "sentence" });

    expect(punctuated).toBeGreaterThan(plain);
    expect(sentence).toBeGreaterThan(plain);
    expect(both).toBe(punctuated + sentence - plain);
  });

  it("uses the section pause once when section and paragraph close together", () => {
    const paragraph = durationForToken({ ...baseInput, boundaryAfter: "paragraph" });
    const section = durationForToken({ ...baseInput, boundaryAfter: "section" });

    expect(section).toBeGreaterThan(paragraph);
    expect(section - 100).toBeGreaterThan(paragraph - 100);
  });

  it("keeps a long-word hold duration positive", () => {
    expect(durationForToken({ ...baseInput, wpm: Number.POSITIVE_INFINITY, isLongWord: true })).toBeGreaterThan(0);
  });
});

describe("timingForToken", () => {
  it("uses only token metadata and settings, not display context", () => {
    const settings = { ...DEFAULT_READER_SETTINGS, wpm: 600, pauseProfile: "balanced" as const };
    const token = word({ punctuationAfter: ".", boundaryAfter: "sentence" });

    expect(timingForToken({ token, settings })).toBe(
      durationForToken({
        wpm: settings.wpm,
        punctuationAfter: token.punctuationAfter,
        boundaryAfter: token.boundaryAfter,
        isLongWord: false,
        pauseProfile: settings.pauseProfile,
      }),
    );
    expect(timingForToken({ token, settings, isLongWord: true })).toBeGreaterThan(
      timingForToken({ token, settings }),
    );
  });

  it("clamps invalid WPM without producing an invalid duration", () => {
    const settings = { ...DEFAULT_READER_SETTINGS, wpm: 0 };
    expect(timingForToken({ token: word(), settings })).toBeGreaterThan(0);
  });
});
