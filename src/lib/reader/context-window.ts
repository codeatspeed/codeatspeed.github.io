import type { Token } from "../../domain/document";
import { computePivotOffset } from "./pivot";

export type TokenMeasurement = {
  width: number;
  beforePivotWidth: number;
  pivotWidth: number;
};

export type MeasuredToken = TokenMeasurement & {
  token: Token;
};

export type ContextWindowInput = {
  left: Token[];
  active: Token;
  right: Token[];
  phraseSize: number;
  maxWidth: number;
  surfaceWidth: number;
  railX: number;
  horizontalPadding: number;
  gapWidth: number;
  baseFontScale: number;
  minFontScale: number;
  measure: (token: Token, fontScale: number) => TokenMeasurement;
};

export type ContextWindowResult = {
  left: MeasuredToken[];
  active: MeasuredToken;
  right: MeasuredToken[];
  mode: "focus" | "context" | "long-word-hold";
  fontScale: number;
  scaleX: number;
};

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function normalizedMeasurement(token: Token, measurement: TokenMeasurement): MeasuredToken {
  const width = finiteNonNegative(measurement.width);
  const beforePivotWidth = Math.min(finiteNonNegative(measurement.beforePivotWidth), width);
  const pivotWidth = Math.min(finiteNonNegative(measurement.pivotWidth), width - beforePivotWidth);
  return { token, width, beforePivotWidth, pivotWidth };
}

function measureToken(token: Token, fontScale: number, measure: ContextWindowInput["measure"]): MeasuredToken {
  return normalizedMeasurement(token, measure(token, fontScale));
}

function sideWidth(tokens: MeasuredToken[], gapWidth: number): number {
  if (tokens.length === 0) return 0;
  return tokens.reduce((sum, item) => sum + item.width, 0) + gapWidth * Math.max(0, tokens.length - 1);
}

function fits(
  left: MeasuredToken[],
  active: MeasuredToken,
  right: MeasuredToken[],
  input: ContextWindowInput,
): boolean {
  const gap = finiteNonNegative(input.gapWidth);
  const leftExtent = sideWidth(left, gap) + (left.length > 0 ? gap : 0);
  const rightExtent = sideWidth(right, gap) + (right.length > 0 ? gap : 0);
  const activeAfterPivot = Math.max(0, active.width - active.beforePivotWidth - active.pivotWidth);
  const leftBound = computePivotOffset({
    beforeWidth: active.beforePivotWidth + leftExtent,
    pivotWidth: active.pivotWidth,
    railX: input.railX,
  });
  const rightBound = input.railX + active.pivotWidth / 2 + activeAfterPivot + rightExtent;
  const padding = finiteNonNegative(input.horizontalPadding);
  const innerLeft = padding;
  const innerRight = Math.max(innerLeft, input.surfaceWidth - padding);
  const widthLimit = Math.max(0, Math.min(finiteNonNegative(input.maxWidth), innerRight - innerLeft));

  return leftBound >= innerLeft && rightBound <= innerRight && rightBound - leftBound <= widthLimit;
}

function nearestSlice(tokens: Token[], count: number): Token[] {
  return tokens.slice(Math.max(0, tokens.length - count));
}

function contextCandidates(left: MeasuredToken[], right: MeasuredToken[], maxNeighbors: number): [MeasuredToken[], MeasuredToken[]][] {
  const candidates: [MeasuredToken[], MeasuredToken[]][] = [];
  for (let count = maxNeighbors; count >= 0; count -= 1) {
    const pairs: [number, number][] = [];
    for (let leftCount = 0; leftCount <= Math.min(left.length, count); leftCount += 1) {
      const rightCount = count - leftCount;
      if (rightCount <= right.length) pairs.push([leftCount, rightCount]);
    }
    pairs.sort(([leftA, rightA], [leftB, rightB]) => {
      const imbalanceA = Math.abs(leftA - rightA);
      const imbalanceB = Math.abs(leftB - rightB);
      return imbalanceA - imbalanceB || rightB - rightA;
    });
    for (const [leftCount, rightCount] of pairs) {
      candidates.push([nearestSlice(left, leftCount), right.slice(0, rightCount)]);
    }
  }
  return candidates;
}

export function chooseContextWindow(input: ContextWindowInput): ContextWindowResult {
  const baseFontScale = Number.isFinite(input.baseFontScale) && input.baseFontScale > 0 ? input.baseFontScale : 1;
  const minFontScale = Math.max(
    0.01,
    Math.min(baseFontScale, Number.isFinite(input.minFontScale) && input.minFontScale > 0 ? input.minFontScale : baseFontScale),
  );
  const phraseSize = Math.max(1, Math.floor(Number.isFinite(input.phraseSize) ? input.phraseSize : 1));
  const active = measureToken(input.active, baseFontScale, input.measure);
  const left = input.left.map((token) => measureToken(token, baseFontScale, input.measure));
  const right = input.right.map((token) => measureToken(token, baseFontScale, input.measure));
  const maxNeighbors = Math.min(left.length + right.length, phraseSize - 1);

  for (const [candidateLeft, candidateRight] of contextCandidates(left, right, maxNeighbors)) {
    if (candidateLeft.length === 0 && candidateRight.length === 0) continue;
    if (fits(candidateLeft, active, candidateRight, input)) {
      return {
        left: candidateLeft,
        active,
        right: candidateRight,
        mode: "context",
        fontScale: baseFontScale,
        scaleX: 1,
      };
    }
  }

  if (fits([], active, [], input)) {
    return { left: [], active, right: [], mode: "focus", fontScale: baseFontScale, scaleX: 1 };
  }

  const reducedActive = measureToken(input.active, minFontScale, input.measure);
  if (fits([], reducedActive, [], input)) {
    return { left: [], active: reducedActive, right: [], mode: "focus", fontScale: minFontScale, scaleX: 1 };
  }

  const innerWidth = Math.max(0, Math.min(finiteNonNegative(input.maxWidth), input.surfaceWidth - 2 * finiteNonNegative(input.horizontalPadding)));
  const scaleX = reducedActive.width > 0 ? Math.min(1, innerWidth / reducedActive.width) : 1;
  return {
    left: [],
    active: reducedActive,
    right: [],
    mode: "long-word-hold",
    fontScale: minFontScale,
    scaleX,
  };
}
