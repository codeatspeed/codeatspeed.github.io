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

export const READER_SETTINGS_LIMITS = {
  wpm: { min: 1, max: 10_000 },
  phraseSize: { min: 1, max: 12 },
  fontScale: { min: 0.75, max: 2 },
} as const;

export function normalizeReaderSettings(value?: Partial<ReaderSettings>): ReaderSettings {
  const source = value ?? {};
  const wpm = Number.isFinite(source.wpm)
    ? Math.min(READER_SETTINGS_LIMITS.wpm.max, Math.max(READER_SETTINGS_LIMITS.wpm.min, Math.round(source.wpm!)))
    : DEFAULT_READER_SETTINGS.wpm;
  const phraseSize = Number.isFinite(source.phraseSize)
    ? Math.min(READER_SETTINGS_LIMITS.phraseSize.max, Math.max(READER_SETTINGS_LIMITS.phraseSize.min, Math.floor(source.phraseSize!)))
    : DEFAULT_READER_SETTINGS.phraseSize;
  const fontScale = Number.isFinite(source.fontScale)
    ? Math.min(READER_SETTINGS_LIMITS.fontScale.max, Math.max(READER_SETTINGS_LIMITS.fontScale.min, source.fontScale!))
    : DEFAULT_READER_SETTINGS.fontScale;
  return {
    ...DEFAULT_READER_SETTINGS,
    ...source,
    wpm,
    phraseSize,
    fontScale,
    contrast: source.contrast === "high" ? "high" : DEFAULT_READER_SETTINGS.contrast,
    pauseProfile: source.pauseProfile === "minimal" || source.pauseProfile === "generous" ? source.pauseProfile : DEFAULT_READER_SETTINGS.pauseProfile,
    reducedMotion: source.reducedMotion === true,
    showContextByDefault: source.showContextByDefault === true,
  };
}
