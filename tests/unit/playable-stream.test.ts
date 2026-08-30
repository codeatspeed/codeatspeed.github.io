import { describe, expect, it } from "vitest";

import type { Document, Token } from "../../src/domain/document";
import { createPlayableStream } from "../../src/lib/reader/playable-stream";

function makeToken(
  text: string,
  kind: Token["kind"],
  boundaryAfter: Token["boundaryAfter"] = "none",
  punctuationAfter = "",
): Token {
  return {
    text,
    kind,
    graphemes: kind === "word" ? [...text] : [],
    pivotIndex: 0,
    boundaryAfter,
    punctuationAfter,
  };
}

function makeDocument(tokens: Token[], id = "doc"): Document {
  return {
    id,
    title: "Test",
    sections: [{ id: `${id}-section`, paragraphs: [{ sentences: [{ tokens }] }] }],
  };
}

describe("createPlayableStream", () => {
  it("emits only words, consumes punctuation, and preserves original positions", () => {
    const punctuation = makeToken(",", "punctuation");
    const document = makeDocument([
      makeToken("Hello", "word", "none"),
      punctuation,
      makeToken(" ", "whitespace"),
      makeToken("world", "word", "sentence", "!"),
      makeToken("!", "punctuation"),
    ]);

    const stream = createPlayableStream(document);

    expect(stream.map((entry) => entry.token.text)).toEqual(["Hello", "world"]);
    expect(stream[0]?.punctuationAfter).toBe(",");
    expect(stream[1]?.punctuationAfter).toBe("!");
    expect(stream[1]?.token.boundaryAfter).toBe("sentence");
    expect(stream.map((entry) => entry.position)).toEqual([
      { documentId: "doc", sectionIndex: 0, sentenceIndex: 0, tokenIndex: 0 },
      { documentId: "doc", sectionIndex: 0, sentenceIndex: 0, tokenIndex: 3 },
    ]);
  });

  it("flattens sections and sentences in document order", () => {
    const document: Document = {
      id: "ordered",
      title: "Order",
      sections: [
        { id: "a", paragraphs: [{ sentences: [{ tokens: [makeToken("one", "word")] }] }] },
        {
          id: "b",
          paragraphs: [
            { sentences: [{ tokens: [makeToken("two", "word")] }, { tokens: [makeToken("three", "word")] }] },
          ],
        },
      ],
    };

    const stream = createPlayableStream(document);

    expect(stream.map((entry) => entry.token.text)).toEqual(["one", "two", "three"]);
    expect(stream[2]?.position).toEqual({
      documentId: "ordered",
      sectionIndex: 1,
      sentenceIndex: 1,
      tokenIndex: 0,
    });
  });

  it("uses a section-wide sentence index across paragraph boundaries", () => {
    const document: Document = {
      id: "paragraph-order",
      title: "Order",
      sections: [
        {
          id: "section",
          paragraphs: [
            { sentences: [{ tokens: [makeToken("first", "word")] }] },
            { sentences: [{ tokens: [makeToken("second", "word")] }] },
          ],
        },
      ],
    };

    const stream = createPlayableStream(document);

    expect(stream[1]?.position.sentenceIndex).toBe(1);
  });

  it("returns no playback steps for an all-whitespace document", () => {
    const document = makeDocument([
      makeToken(" ", "whitespace"),
      makeToken("\n\t", "whitespace"),
    ]);

    expect(createPlayableStream(document)).toEqual([]);
  });
});
