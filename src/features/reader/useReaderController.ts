import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { Document, Token } from "../../domain/document";
import type { ReaderNotice, ReaderPosition, ReaderState } from "../../domain/reader-state";
import { DEFAULT_READER_SETTINGS, type ReaderSettings } from "../../domain/settings";
import { getPosition, getSettings, savePosition, saveSettings, StorageUnavailableError } from "../../lib/persistence/database";
import { chooseContextWindow, type ContextWindowResult, type TokenMeasurement } from "../../lib/reader/context-window";
import { createPlayableStream, type PlayableToken } from "../../lib/reader/playable-stream";
import { timingForToken } from "../../lib/reader/timing";

export type LayoutModeReport = {
  position: ReaderPosition;
  mode: ContextWindowResult["mode"];
};

export type SurfaceMetrics = {
  surfaceWidth: number;
  railX: number;
  horizontalPadding: number;
  gapWidth: number;
  measure: (token: Token, fontScale: number) => TokenMeasurement;
};

export type ReaderViewModel = {
  activeToken: Token;
  activePosition: ReaderPosition;
  layout: ContextWindowResult;
  progress: number;
};

export type ReaderController = {
  state: ReaderState;
  view: ReaderViewModel;
  announcement: string;
  togglePlayback(): void;
  stepPrevious(): void;
  stepNext(): void;
  setWpm(wpm: number): void;
  setMode(mode: "focus" | "context"): void;
  setSurfaceMetrics(metrics: SurfaceMetrics): void;
  setRenderedMode(report: LayoutModeReport): void;
  setPhraseSize(size: number): void;
  setExpanded(expanded: boolean): void;
  restartFromCurrentSection(): void;
  dismissNotice(): void;
};

const positionEqual = (left: ReaderPosition, right: ReaderPosition): boolean =>
  left.documentId === right.documentId &&
  left.sectionIndex === right.sectionIndex &&
  left.sentenceIndex === right.sentenceIndex &&
  left.tokenIndex === right.tokenIndex;

function validSettings(value: ReaderSettings | undefined): ReaderSettings {
  const source = value ?? DEFAULT_READER_SETTINGS;
  const wpm = Number.isFinite(source.wpm) ? Math.min(10_000, Math.max(1, source.wpm)) : DEFAULT_READER_SETTINGS.wpm;
  const phraseSize = Number.isFinite(source.phraseSize) ? Math.max(1, Math.floor(source.phraseSize)) : DEFAULT_READER_SETTINGS.phraseSize;
  const fontScale = Number.isFinite(source.fontScale) && source.fontScale > 0 ? source.fontScale : DEFAULT_READER_SETTINGS.fontScale;
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

function fallbackMeasureToken(token: Token, scale: number): TokenMeasurement {
  const widths = token.graphemes.map((grapheme) => grapheme.length * scale);
  const pivotWidth = widths[token.pivotIndex] ?? 0;
  const beforePivotWidth = widths.slice(0, token.pivotIndex).reduce((total, width) => total + width, 0);
  return { width: widths.reduce((total, width) => total + width, 0), beforePivotWidth, pivotWidth };
}

const DEFAULT_SURFACE_METRICS: SurfaceMetrics = {
  surfaceWidth: 1,
  railX: 0.5,
  horizontalPadding: 32,
  gapWidth: 16,
  measure: fallbackMeasureToken,
};

function firstPosition(stream: PlayableToken[], document: Document): ReaderPosition {
  return stream[0]?.position ?? { documentId: document.id, sectionIndex: 0, sentenceIndex: 0, tokenIndex: 0 };
}

export function useReaderController(document: Document, initialNotice?: ReaderNotice): ReaderController {
  const stream = useMemo(() => createPlayableStream(document), [document]);
  const initial = firstPosition(stream, document);
  const indexRef = useRef(0);
  const generationRef = useRef(0);
  const timerRef = useRef<number | undefined>(undefined);
  const stateRef = useRef<ReaderState | undefined>(undefined);
  const pushedExpandedRef = useRef(false);
  const [state, setState] = useState<ReaderState>({
    position: initial,
    status: "loading",
    mode: "focus",
    renderMode: "focus",
    settings: DEFAULT_READER_SETTINGS,
    notice: initialNotice,
    expanded: false,
  });
  const [surfaceMetrics, setSurfaceMetricsState] = useState<SurfaceMetrics>(DEFAULT_SURFACE_METRICS);
  const [announcement, setAnnouncement] = useState("Reader is loading.");
  stateRef.current = state;

  const setNotice = useCallback((notice: ReaderNotice) => {
    setState((current) => (current.notice === notice ? current : { ...current, notice }));
  }, []);

  const persistPosition = useCallback((position: ReaderPosition) => {
    void savePosition(position).catch((error: unknown) => {
      if (error instanceof StorageUnavailableError) {
        setNotice({ kind: "storage-unavailable", message: error.message });
      }
    });
  }, [setNotice]);

  const announceManual = useCallback((token: Token, reason: string) => {
    setAnnouncement(`${reason}: ${token.text}.`);
  }, []);

  const persistSettings = useCallback((settings: ReaderSettings) => {
    void saveSettings(settings).catch((error: unknown) => {
      if (error instanceof StorageUnavailableError) {
        setNotice({ kind: "storage-unavailable", message: error.message });
      }
    });
  }, [setNotice]);

  const applyIndex = useCallback((nextIndex: number, reason?: string, autoplay = false) => {
    if (stream.length === 0) {
      setState((current) => ({ ...current, status: "error" }));
      return;
    }
    const bounded = Math.min(stream.length - 1, Math.max(0, nextIndex));
    indexRef.current = bounded;
    const next = stream[bounded]!;
    setState((current) => ({ ...current, position: next.position }));
    persistPosition(next.position);
    if (reason) announceManual(next.token, reason);
    else if (autoplay && (next.token.boundaryAfter === "sentence" || next.token.boundaryAfter === "section")) {
      setAnnouncement(`Now reading ${next.token.text}.`);
    }
  }, [announceManual, persistPosition, stream]);

  useEffect(() => {
    const generation = ++generationRef.current;
    let mounted = true;
    const restore = async () => {
      let settings = DEFAULT_READER_SETTINGS;
      let notice = initialNotice;
      try {
        settings = validSettings(await getSettings());
      } catch (error: unknown) {
        if (error instanceof StorageUnavailableError || error instanceof Error) {
          notice ??= { kind: "storage-unavailable", message: error instanceof Error ? error.message : "Reader storage is unavailable" };
          settings = DEFAULT_READER_SETTINGS;
        }
      }
      if (!mounted || generation !== generationRef.current) return;
      let restored = firstPosition(stream, document);
      try {
        const position = await getPosition(document.id);
        const found = position === undefined ? undefined : stream.findIndex((entry) => positionEqual(entry.position, position));
        if (found !== undefined && found >= 0) {
          indexRef.current = found;
          restored = stream[found]!.position;
        }
      } catch (error: unknown) {
        notice ??= { kind: "storage-unavailable", message: error instanceof Error ? error.message : "Reader storage is unavailable" };
      }
      if (!mounted || generation !== generationRef.current) return;
      indexRef.current = Math.max(0, stream.findIndex((entry) => positionEqual(entry.position, restored)));
      setState({
        position: restored,
        status: stream.length > 0 ? "playing" : "error",
        mode: settings.showContextByDefault ? "context" : "focus",
        renderMode: settings.showContextByDefault ? "context" : "focus",
        settings,
        notice,
        expanded: false,
      });
      setAnnouncement(stream.length > 0 ? `Ready: ${stream[indexRef.current]?.token.text ?? "reader"}.` : "This document has no readable words.");
    };
    void restore();
    return () => {
      mounted = false;
      generationRef.current += 1;
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, [document, initialNotice, stream]);

  const togglePlayback = useCallback(() => {
    setState((current) => {
      if (current.status === "loading" || current.status === "error" || current.status === "complete") return current;
      if (current.status === "playing") {
        const active = stream[indexRef.current]?.token;
        if (active) announceManual(active, "Paused");
        return { ...current, status: "paused" };
      }
      return { ...current, status: "playing" };
    });
  }, [announceManual, stream]);

  const stepPrevious = useCallback(() => {
    const active = stream[Math.max(0, indexRef.current - 1)];
    if (!active) return;
    applyIndex(indexRef.current - 1, "Previous");
    setState((current) => ({ ...current, status: current.status === "playing" ? "playing" : "paused" }));
  }, [applyIndex, stream]);

  const stepNext = useCallback(() => {
    if (stream.length === 0) return;
    if (indexRef.current >= stream.length - 1) {
      setState((current) => ({ ...current, status: "complete" }));
      const active = stream[indexRef.current]?.token;
      if (active) announceManual(active, "Complete");
      return;
    }
    applyIndex(indexRef.current + 1, "Next");
    setState((current) => ({ ...current, status: current.status === "playing" ? "playing" : "paused" }));
  }, [announceManual, applyIndex, stream]);

  const setWpm = useCallback((wpm: number) => {
    if (!Number.isFinite(wpm)) return;
    const current = stateRef.current;
    if (!current) return;
    const settings = { ...current.settings, wpm: Math.min(10_000, Math.max(1, Math.round(wpm))) };
    setState((value) => ({ ...value, settings }));
    persistSettings(settings);
  }, [persistSettings]);

  const setMode = useCallback((mode: "focus" | "context") => {
    setState((current) => ({ ...current, mode, renderMode: mode }));
  }, []);
  const setPhraseSize = useCallback((size: number) => {
    if (!Number.isFinite(size)) return;
    const current = stateRef.current;
    if (!current) return;
    const settings = { ...current.settings, phraseSize: Math.max(1, Math.min(12, Math.floor(size))) };
    setState((value) => ({ ...value, settings }));
    persistSettings(settings);
  }, [persistSettings]);
  const setRenderedMode = useCallback((report: LayoutModeReport) => {
    setState((current) => {
      if (!positionEqual(current.position, report.position) || current.renderMode === report.mode) return current;
      return { ...current, renderMode: report.mode };
    });
  }, []);
  const setSurfaceMetrics = useCallback((metrics: SurfaceMetrics) => {
    if (!Number.isFinite(metrics.surfaceWidth) || metrics.surfaceWidth <= 0) return;
    setSurfaceMetricsState((current) => current.surfaceWidth === metrics.surfaceWidth && current.railX === metrics.railX && current.horizontalPadding === metrics.horizontalPadding && current.gapWidth === metrics.gapWidth ? current : metrics);
  }, []);
  const restartFromCurrentSection = useCallback(() => {
    const current = stream[indexRef.current];
    if (!current) return;
    const firstInSection = stream.findIndex((entry) => entry.position.sectionIndex === current.position.sectionIndex);
    applyIndex(firstInSection < 0 ? 0 : firstInSection, "Restarted");
    setState((value) => ({ ...value, status: "paused" }));
  }, [applyIndex, stream]);
  const dismissNotice = useCallback(() => setState((current) => ({ ...current, notice: undefined })), []);

  const setExpanded = useCallback((expanded: boolean) => {
    if (expanded) {
      if (!pushedExpandedRef.current) {
        window.history.pushState({ reader: true, expanded: true }, "", window.location.href);
        pushedExpandedRef.current = true;
      }
      setState((current) => ({ ...current, expanded: true }));
      return;
    }
    if (pushedExpandedRef.current) {
      pushedExpandedRef.current = false;
      window.history.back();
    }
    setState((current) => ({ ...current, expanded: false }));
  }, []);

  useEffect(() => {
    window.history.replaceState({ reader: true }, "", window.location.href);
    const onPopState = () => {
      if (pushedExpandedRef.current) pushedExpandedRef.current = false;
      setState((current) => ({ ...current, expanded: false }));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (state.status !== "playing" || stream.length === 0) return;
    const schedule = () => {
      const active = stream[indexRef.current];
      if (!active) return;
      timerRef.current = window.setTimeout(() => {
        if (stateRef.current?.status !== "playing") return;
        if (indexRef.current >= stream.length - 1) {
          setState((current) => ({ ...current, status: "complete" }));
          const token = stream[indexRef.current]?.token;
          if (token) setAnnouncement(`Complete: ${token.text}.`);
          return;
        }
        applyIndex(indexRef.current + 1, undefined, true);
        schedule();
      }, timingForToken({ token: active.token, settings: state.settings, isLongWord: state.renderMode === "long-word-hold" }));
    };
    schedule();
    return () => {
      if (timerRef.current !== undefined) window.clearTimeout(timerRef.current);
    };
  }, [applyIndex, state.renderMode, state.settings, state.status, stream]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const tag = target?.tagName;
      const interactive = tag === "BUTTON" || tag === "A" || tag === "SELECT" || tag === "OPTION";
      const isPlayButton = target?.getAttribute("data-reader-play-toggle") === "true";
      if (tag === "INPUT" || tag === "TEXTAREA" || (interactive && !isPlayButton)) return;
      if (event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        stepPrevious();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        stepNext();
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setWpm((stateRef.current?.settings.wpm ?? DEFAULT_READER_SETTINGS.wpm) + 50);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        setWpm((stateRef.current?.settings.wpm ?? DEFAULT_READER_SETTINGS.wpm) - 50);
      } else if (event.key.toLowerCase() === "c") {
        event.preventDefault();
        setMode(stateRef.current?.mode === "context" ? "focus" : "context");
      } else if (event.key === "Escape" && stateRef.current?.expanded) {
        event.preventDefault();
        setExpanded(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [setExpanded, setMode, setWpm, stepNext, stepPrevious, togglePlayback]);

  const view = useMemo<ReaderViewModel>(() => {
    const activeEntry = stream[indexRef.current] ?? { token: { text: "", kind: "word", graphemes: [], pivotIndex: 0, boundaryAfter: "none", punctuationAfter: "" }, position: initial, punctuationAfter: "" };
    const neighbors = state.mode === "context" ? state.settings.phraseSize : 1;
    const left = stream.slice(Math.max(0, indexRef.current - neighbors + 1), indexRef.current).map((entry) => entry.token);
    const right = stream.slice(indexRef.current + 1, indexRef.current + neighbors).map((entry) => entry.token);
    const layout = chooseContextWindow({
      left,
      active: activeEntry.token,
      right,
      phraseSize: state.mode === "context" ? state.settings.phraseSize : 1,
      maxWidth: surfaceMetrics.surfaceWidth,
      surfaceWidth: surfaceMetrics.surfaceWidth,
      railX: surfaceMetrics.railX,
      horizontalPadding: surfaceMetrics.horizontalPadding,
      gapWidth: surfaceMetrics.gapWidth,
      baseFontScale: state.settings.fontScale,
      minFontScale: 0.62,
      measure: surfaceMetrics.measure,
    });
    return {
      activeToken: activeEntry.token,
      activePosition: activeEntry.position,
      layout,
      progress: stream.length <= 1 ? 0 : indexRef.current / (stream.length - 1),
    };
  }, [initial, state.mode, state.position, state.settings.fontScale, state.settings.phraseSize, stream, surfaceMetrics]);

  return { state, view, announcement, togglePlayback, stepPrevious, stepNext, setWpm, setMode, setSurfaceMetrics, setRenderedMode, setPhraseSize, setExpanded, restartFromCurrentSection, dismissNotice };
}
