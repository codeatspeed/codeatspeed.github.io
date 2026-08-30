import type { ReaderSettings } from "./settings";

export type ReaderPosition = {
  documentId: string;
  sectionIndex: number;
  sentenceIndex: number;
  tokenIndex: number;
};

export type ReaderNotice = {
  kind: "storage-unavailable";
  message: string;
};

export type ReaderState = {
  position: ReaderPosition;
  status: "loading" | "paused" | "playing" | "complete" | "error";
  mode: "focus" | "context";
  renderMode: "focus" | "context" | "long-word-hold";
  settings: ReaderSettings;
  notice?: ReaderNotice;
  expanded: boolean;
};
