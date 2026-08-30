export type TextSegmentKind = "word" | "punctuation" | "whitespace";

export type BoundaryAfter = "none" | "sentence" | "paragraph" | "section";

export type Token = {
  text: string;
  kind: TextSegmentKind;
  graphemes: string[];
  pivotIndex: number;
  boundaryAfter: BoundaryAfter;
  punctuationAfter: string;
};

export type Sentence = {
  tokens: Token[];
};

export type Paragraph = {
  sentences: Sentence[];
};

export type Section = {
  paragraphs: Paragraph[];
};

export type Document = {
  id: string;
  title?: string;
  author?: string;
  sections: Section[];
};
