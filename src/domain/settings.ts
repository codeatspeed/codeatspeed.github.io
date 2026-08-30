export type ReaderSettings = {
  wpm: number;
  phraseSize: number;
  fontScale: number;
  contrast: "default" | "high";
  pauseProfile: "minimal" | "balanced" | "generous";
  reducedMotion: boolean;
  showContextByDefault: boolean;
};

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  wpm: 1000,
  phraseSize: 3,
  fontScale: 1,
  contrast: "default",
  pauseProfile: "balanced",
  reducedMotion: false,
  showContextByDefault: false,
};
