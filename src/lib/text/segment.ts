import GraphemeSplitter from "grapheme-splitter";

import type { TextSegmentKind } from "../../domain/document";

export type TextSegment = {
  text: string;
  kind: TextSegmentKind;
};

function intlSegmenter(granularity: "grapheme" | "word"): Intl.Segmenter | undefined {
  if (typeof Intl.Segmenter !== "function") return undefined;
  return new Intl.Segmenter(undefined, { granularity });
}

export function segmentGraphemes(text: string): string[] {
  if (text.length === 0) return [];

  const segmenter = intlSegmenter("grapheme");
  if (segmenter) {
    return Array.from(segmenter.segment(text), ({ segment }) => segment);
  }

  return new GraphemeSplitter().splitGraphemes(text);
}

function isWhitespace(text: string): boolean {
  return /^\s+$/u.test(text);
}

function isWordText(text: string): boolean {
  return /[\p{L}\p{M}\p{N}]/u.test(text);
}

function fallbackSegmentWords(text: string): TextSegment[] {
  const graphemes = segmentGraphemes(text);
  const result: TextSegment[] = [];
  let currentKind: TextSegmentKind | undefined;
  let currentText = "";

  const flush = () => {
    if (currentText.length > 0 && currentKind) {
      result.push({ text: currentText, kind: currentKind });
    }
    currentText = "";
    currentKind = undefined;
  };

  for (const grapheme of graphemes) {
    const kind: TextSegmentKind = isWhitespace(grapheme)
      ? "whitespace"
      : isWordText(grapheme)
        ? "word"
        : "punctuation";
    if (kind !== currentKind) flush();
    currentKind = kind;
    currentText += grapheme;
  }
  flush();
  return result;
}

function mergeAdjacentSegments(segments: TextSegment[]): TextSegment[] {
  const merged: TextSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous?.kind === segment.kind) {
      previous.text += segment.text;
    } else {
      merged.push({ ...segment });
    }
  }
  return merged;
}

export function segmentWords(text: string): TextSegment[] {
  if (text.length === 0) return [];

  const segmenter = intlSegmenter("word");
  if (!segmenter) return fallbackSegmentWords(text);

  return mergeAdjacentSegments(
    Array.from(segmenter.segment(text), ({ segment, isWordLike }) => ({
      text: segment,
      kind: isWhitespace(segment) ? "whitespace" : isWordLike ? "word" : "punctuation",
    })),
  );
}

export function selectPivotIndex(graphemes: string[]): number {
  if (graphemes.length === 0) return 0;
  return Math.floor(graphemes.length / 2);
}
