import { describe, expect, it } from "vitest";

import { normalizeText } from "../../src/lib/text/normalize";

describe("normalizeText", () => {
  it("rejects blank and punctuation-only input", () => {
    expect(() => normalizeText(" \r\n\n\t ")).toThrow();
    expect(() => normalizeText("…?!")).toThrow();
  });

  it("normalizes line endings and keeps paragraph boundaries", () => {
    const document = normalizeText("First line.\r\n\r\nSecond line!", {
      title: "Notes",
      author: "Reader",
    });

    expect(document.title).toBe("Notes");
    expect(document.author).toBe("Reader");
    expect(document.sections).toHaveLength(1);
    expect(document.sections[0]?.paragraphs).toHaveLength(2);
    expect(document.sections[0]?.paragraphs[0]?.sentences[0]?.tokens.map((token) => token.text).join(""))
      .toBe("First line.");
    expect(document.sections[0]?.paragraphs[1]?.sentences[0]?.tokens.map((token) => token.text).join(""))
      .toBe("Second line!");
  });
  it("uses a required title and deterministic section identifier", () => {
    const first = normalizeText("Alpha");
    const second = normalizeText("Alpha");

    expect(first.title).toBe("Untitled");
    expect(first.sections[0]?.id).toBe(`${first.id}-section-0`);
    expect(first.sections[0]?.id).toBe(second.sections[0]?.id);
  });

  it("recognizes Unicode sentence terminators", () => {
    const document = normalizeText("你好。下一句！ سؤال؟");
    const sentences = document.sections[0]?.paragraphs[0]?.sentences ?? [];

    expect(sentences).toHaveLength(3);
    expect(sentences[0]?.tokens.map((token) => token.text).join("")).toBe("你好。");
    expect(sentences[1]?.tokens.map((token) => token.text).join("")).toBe("下一句！ ");
    expect(sentences[2]?.tokens.map((token) => token.text).join("")).toBe("سؤال؟");
  });

  it("marks sentence boundaries and gives the final section boundary precedence", () => {
    const document = normalizeText("One sentence. Another sentence.\n\nFinal paragraph");
    const paragraphs = document.sections[0]?.paragraphs ?? [];
    const firstSentence = paragraphs[0]?.sentences[0];
    const secondSentence = paragraphs[0]?.sentences[1];
    const finalSentence = paragraphs[1]?.sentences[0];

    expect(firstSentence?.tokens.find((token) => token.kind === "word" && token.text === "sentence")?.boundaryAfter)
      .toBe("sentence");
    expect(secondSentence?.tokens.find((token) => token.kind === "word" && token.text === "sentence")?.boundaryAfter)
      .toBe("paragraph");
    expect(finalSentence?.tokens.find((token) => token.kind === "word" && token.text === "paragraph")?.boundaryAfter)
      .toBe("section");
  });

  it("attaches punctuation metadata without making it a playback word", () => {
    const document = normalizeText("Hello, world!");
    const tokens = document.sections[0]?.paragraphs[0]?.sentences[0]?.tokens ?? [];
    const hello = tokens.find((token) => token.kind === "word" && token.text === "Hello");
    const punctuation = tokens.find((token) => token.kind === "punctuation");

    expect(hello?.punctuationAfter).toBe(",");
    expect(punctuation?.text).toBe(",");
    expect(punctuation?.kind).toBe("punctuation");
  });

  it("has a deterministic first token position and computed word pivot data", () => {
    const first = normalizeText("Alpha beta");
    const second = normalizeText("Alpha beta");
    const token = first.sections[0]?.paragraphs[0]?.sentences[0]?.tokens.find((item) => item.kind === "word");

    expect(first.id).toBe(second.id);
    expect(first.sections[0]?.paragraphs[0]?.sentences[0]?.tokens[0]?.text).toBe("Alpha");
    expect(token?.graphemes).toEqual(["A", "l", "p", "h", "a"]);
    expect(token?.pivotIndex).toBe(2);
  });
});
