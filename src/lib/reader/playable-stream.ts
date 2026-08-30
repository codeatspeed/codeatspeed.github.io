import type { Document, Token } from "../../domain/document";
import type { ReaderPosition } from "../../domain/reader-state";

export type PlayableToken = {
  token: Token;
  position: ReaderPosition;
  punctuationAfter: string;
};

export function createPlayableStream(document: Document): PlayableToken[] {
  const stream: PlayableToken[] = [];

  for (let sectionIndex = 0; sectionIndex < document.sections.length; sectionIndex += 1) {
    const section = document.sections[sectionIndex]!;
    let sectionSentenceIndex = 0;
    for (const paragraph of section.paragraphs) {
      for (const sentence of paragraph.sentences) {
        const sentenceIndex = sectionSentenceIndex;
        sectionSentenceIndex += 1;
        for (let tokenIndex = 0; tokenIndex < sentence.tokens.length; tokenIndex += 1) {
          const token = sentence.tokens[tokenIndex]!;
          if (token.kind !== "word") continue;

          let punctuationAfter = "";
          for (let nextIndex = tokenIndex + 1; nextIndex < sentence.tokens.length; nextIndex += 1) {
            const following = sentence.tokens[nextIndex]!;
            if (following.kind !== "punctuation") break;
            punctuationAfter += following.text;
          }
          if (punctuationAfter.length === 0) punctuationAfter = token.punctuationAfter;

          const playableToken: Token = { ...token, punctuationAfter };
          const position: ReaderPosition = {
            documentId: document.id,
            sectionIndex,
            sentenceIndex,
            tokenIndex,
          };
          stream.push({ token: playableToken, position, punctuationAfter });
        }
      }
    }
  }

  return stream;
}
