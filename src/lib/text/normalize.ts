import type {
  BoundaryAfter,
  Document,
  Paragraph,
  Sentence,
  Section,
  Token,
} from "../../domain/document";
import { segmentGraphemes, segmentWords, selectPivotIndex, type TextSegment } from "./segment";

const TERMINAL_PUNCTUATION = /[.!?\u3002\uFF01\uFF1F\u061F]/u;
function trimEmptyBoundaryLines(text: string): string {
  const lines = text.split("\n");
  let first = 0;
  let last = lines.length;

  while (first < last && /^[ \t]*$/u.test(lines[first] ?? "")) first += 1;
  while (last > first && /^[ \t]*$/u.test(lines[last - 1] ?? "")) last -= 1;
  return lines.slice(first, last).join("\n");
}

function splitParagraphs(text: string): string[] {
  if (text.length === 0) return [];
  return text.split(/\n[ \t]*\n(?:[ \t]*\n)*/u);
}

function splitSentences(segments: TextSegment[]): TextSegment[][] {
  const sentences: TextSegment[][] = [];
  let current: TextSegment[] = [];
  let hasWord = false;
  let ended = false;

  const flush = () => {
    if (current.length > 0) sentences.push(current);
    current = [];
    hasWord = false;
    ended = false;
  };

  for (const segment of segments) {
    if (segment.kind === "word" && ended) flush();
    current.push(segment);
    if (segment.kind === "word") hasWord = true;
    if (segment.kind === "punctuation" && hasWord && TERMINAL_PUNCTUATION.test(segment.text)) {
      ended = true;
    }
  }
  flush();
  return sentences;
}

function makeToken(segment: TextSegment): Token {
  const isWord = segment.kind === "word";
  const graphemes = isWord ? segmentGraphemes(segment.text) : [];
  return {
    text: segment.text,
    kind: segment.kind,
    graphemes,
    pivotIndex: isWord ? selectPivotIndex(graphemes) : 0,
    boundaryAfter: "none",
    punctuationAfter: "",
  };
}

function attachPunctuation(tokens: Token[]): void {
  for (let index = 0; index < tokens.length; index += 1) {
    if (tokens[index]?.kind !== "word") continue;
    let punctuation = "";
    for (let next = index + 1; next < tokens.length; next += 1) {
      const following = tokens[next];
      if (following?.kind === "punctuation") {
        punctuation += following.text;
      } else {
        break;
      }
    }
    tokens[index]!.punctuationAfter = punctuation;
  }
}

function markBoundary(sentence: Sentence, boundary: BoundaryAfter): void {
  for (let index = sentence.tokens.length - 1; index >= 0; index -= 1) {
    const token = sentence.tokens[index];
    if (token?.kind === "word") {
      token.boundaryAfter = boundary;
      return;
    }
  }
}

function createParagraph(text: string, isLastParagraph: boolean): Paragraph {
  const sentenceSegments = splitSentences(segmentWords(text));
  const sentences = sentenceSegments.map((segments) => {
    const tokens = segments.map(makeToken);
    attachPunctuation(tokens);
    const sentence: Sentence = { tokens };
    markBoundary(sentence, "sentence");
    return sentence;
  });

  if (sentences.length > 0) {
    markBoundary(sentences[sentences.length - 1]!, isLastParagraph ? "section" : "paragraph");
  }
  return { sentences };
}

function documentId(input: string, title?: string, author?: string): string {
  const source = `${title ?? ""}\u0000${author ?? ""}\u0000${input}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `document-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function normalizeText(
  input: string,
  metadata: { title?: string; author?: string } = {},
): Document {
  const normalized = trimEmptyBoundaryLines(input.replace(/\r\n?/gu, "\n"));
  const paragraphTexts = splitParagraphs(normalized);
  const paragraphs = paragraphTexts.map((text, index) =>
    createParagraph(text, index === paragraphTexts.length - 1),
  );
  const hasWord = paragraphs.some((paragraph) =>
    paragraph.sentences.some((sentence) => sentence.tokens.some((token) => token.kind === "word")),
  );

  if (!hasWord) throw new Error("Text must contain at least one word");

  const title = metadata.title ?? "Untitled";
  const id = documentId(normalized, title, metadata.author);
  const section: Section = { id: `${id}-section-0`, paragraphs };
  return {
    id,
    title,
    ...(metadata.author === undefined ? {} : { author: metadata.author }),
    sections: [section],
  };
}
