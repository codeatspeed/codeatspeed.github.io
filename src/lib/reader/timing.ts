import type { Token } from "../../domain/document";
import type { ReaderSettings } from "../../domain/settings";

export type TimingInput = {
  wpm: number;
  punctuationAfter: string;
  boundaryAfter: Token["boundaryAfter"];
  isLongWord: boolean;
  pauseProfile: ReaderSettings["pauseProfile"];
};

type PauseSet = {
  punctuation: number;
  sentence: number;
  paragraph: number;
  section: number;
  longWord: number;
};

const PAUSES: Record<ReaderSettings["pauseProfile"], PauseSet> = {
  minimal: { punctuation: 60, sentence: 160, paragraph: 260, section: 420, longWord: 120 },
  balanced: { punctuation: 120, sentence: 300, paragraph: 500, section: 800, longWord: 240 },
  generous: { punctuation: 200, sentence: 480, paragraph: 760, section: 1200, longWord: 400 },
};

function clampedWpm(wpm: number): number {
  if (!Number.isFinite(wpm)) return wpm === Number.POSITIVE_INFINITY ? 10_000 : 1;
  return Math.min(10_000, Math.max(1, wpm));
}

function pauseSet(profile: ReaderSettings["pauseProfile"]): PauseSet {
  return PAUSES[profile] ?? PAUSES.balanced;
}

export function durationForToken(input: TimingInput): number {
  const pauses = pauseSet(input.pauseProfile);
  const baseDuration = 60_000 / clampedWpm(input.wpm);
  const punctuationPause = input.punctuationAfter.length > 0 ? pauses.punctuation : 0;
  const boundaryPause =
    input.boundaryAfter === "section"
      ? pauses.section
      : input.boundaryAfter === "paragraph"
        ? pauses.paragraph
        : input.boundaryAfter === "sentence"
          ? pauses.sentence
          : 0;
  const longWordPause = input.isLongWord ? pauses.longWord : 0;
  return Math.max(1, baseDuration + punctuationPause + boundaryPause + longWordPause);
}

export function timingForToken(input: { token: Token; settings: ReaderSettings; isLongWord?: boolean }): number {
  return durationForToken({
    wpm: input.settings.wpm,
    punctuationAfter: input.token.punctuationAfter,
    boundaryAfter: input.token.boundaryAfter,
    isLongWord: input.isLongWord ?? false,
    pauseProfile: input.settings.pauseProfile,
  });
}
