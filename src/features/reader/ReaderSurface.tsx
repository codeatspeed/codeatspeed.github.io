import { useCallback, useEffect, useRef, useState } from "react";

import type { Document, Token } from "../../domain/document";
import type { ReaderState } from "../../domain/reader-state";
import { chooseContextWindow, type ContextWindowResult, type TokenMeasurement } from "../../lib/reader/context-window";
import { computePivotOffset } from "../../lib/reader/pivot";
import type { LayoutModeReport, ReaderViewModel, SurfaceMetrics } from "./useReaderController";

export type ReaderSurfaceProps = {
  document: Document;
  state: ReaderState;
  view: ReaderViewModel;
  onRenderedMode(report: LayoutModeReport): void;
  onSurfaceMetrics?(metrics: SurfaceMetrics): void;
};

function WordSpans({ token, active = false }: { token: Token; active?: boolean }) {
  const before = token.graphemes.slice(0, token.pivotIndex).join("");
  const pivot = token.graphemes[token.pivotIndex] ?? "";
  const after = token.graphemes.slice(token.pivotIndex + 1).join("");
  return (
    <span className={active ? "reader-word reader-word--active" : "reader-word"} data-testid={active ? "reader-active-word" : undefined}>
      <span aria-hidden="true" className="reader-word__before">{before}</span>
      <span aria-hidden="true" className="reader-word__pivot" data-testid={active ? "reader-pivot" : undefined}>{pivot}</span>
      <span aria-hidden="true" className="reader-word__after">{after}</span>
    </span>
  );
}

function FocusWord({ token, offset }: { token: Token; offset: number }) {
  return (
    <div className="reader-focus" data-testid="reader-focus-word" style={{ transform: `translateX(${offset}px)` }}>
      <WordSpans token={token} active />
      <span className="visually-hidden" role="img" aria-label={token.text}>{token.text}</span>
    </div>
  );
}

function ContextWords({ layout }: { layout: ContextWindowResult }) {
  if (layout.mode === "long-word-hold") {
    return (
      <div className="reader-context" data-testid="reader-context" style={{ fontSize: `${layout.fontScale}rem` }}>
        <span className="reader-context__long-word" style={{ transform: `scaleX(${layout.scaleX})`, transformOrigin: `${layout.active.beforePivotWidth + layout.active.pivotWidth / 2}px center` }}>
          <WordSpans token={layout.active.token} active />
          <span className="visually-hidden" role="img" aria-label={layout.active.token.text}>{layout.active.token.text}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="reader-context" data-testid="reader-context" style={{ fontSize: `${layout.fontScale}rem` }}>
      <div className="reader-context__left" aria-hidden="true">
        {layout.left.map((item, index) => <WordSpans key={`${item.token.text}-${index}`} token={item.token} />)}
      </div>
      <span className="reader-context__active">
        <WordSpans token={layout.active.token} active />
        <span className="visually-hidden" role="img" aria-label={layout.active.token.text}>{layout.active.token.text}</span>
      </span>
      <div className="reader-context__right" aria-hidden="true">
        {layout.right.map((item, index) => <WordSpans key={`${item.token.text}-${index}`} token={item.token} />)}
      </div>
    </div>
  );
}

export function ReaderSurface({ document, state, view, onRenderedMode, onSurfaceMetrics }: ReaderSurfaceProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [railOffset, setRailOffset] = useState(0);

  const measureToken = useCallback((token: Token, scale: number): TokenMeasurement => {
    const measureElement = measureRef.current;
    const zone = zoneRef.current;
    const computed = zone ? window.getComputedStyle(zone) : undefined;
    const fontSize = computed ? Number.parseFloat(computed.fontSize) * scale : scale;
    const fontFamily = computed?.fontFamily ?? "sans-serif";
    const canvas = canvasRef.current;
    let context: CanvasRenderingContext2D | undefined;
    if (canvas && !/jsdom/i.test(navigator.userAgent)) {
      try {
        context = canvas.getContext("2d") ?? undefined;
      } catch {
        context = undefined;
      }
    }
    const widths = token.graphemes.map((grapheme) => {
      if (measureElement) {
        measureElement.style.fontFamily = fontFamily;
        measureElement.style.fontSize = `${fontSize}px`;
        measureElement.textContent = grapheme;
        const measured = measureElement.getBoundingClientRect().width || measureElement.offsetWidth;
        if (measured > 0) return measured;
      }
      const measured = context?.measureText(grapheme).width;
      return measured && measured > 0 ? measured : grapheme.length * Math.max(fontSize, 1);
    });
    const beforePivotWidth = widths.slice(0, token.pivotIndex).reduce((total, width) => total + width, 0);
    const pivotWidth = widths[token.pivotIndex] ?? 0;
    return { width: widths.reduce((total, width) => total + width, 0), beforePivotWidth, pivotWidth };
  }, []);

  useEffect(() => {
    const zone = zoneRef.current;
    if (!zone) return;
    const reportMetrics = () => {
      const bounds = zone.getBoundingClientRect();
      const width = bounds.width > 0 ? bounds.width : window.innerWidth;
      const computed = window.getComputedStyle(zone);
      const horizontalPadding = Number.parseFloat(computed.paddingLeft) || 0;
      const gapWidth = Number.parseFloat(computed.columnGap) || Number.parseFloat(computed.gap) || 0;
      const railX = width / 2;
      const activeMeasurement = measureToken(view.activeToken, state.settings.fontScale);
      setRailOffset(computePivotOffset({ beforeWidth: activeMeasurement.beforePivotWidth, pivotWidth: activeMeasurement.pivotWidth, railX }));
      onSurfaceMetrics?.({ surfaceWidth: width, railX, horizontalPadding, gapWidth, measure: measureToken });
    };
    reportMetrics();
    if (typeof ResizeObserver !== "undefined") {
      const observer = new ResizeObserver(reportMetrics);
      observer.observe(zone);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", reportMetrics);
    return () => window.removeEventListener("resize", reportMetrics);
  }, [measureToken, onSurfaceMetrics, state.settings.fontScale, view.activeToken]);

  useEffect(() => {
    onRenderedMode({ position: view.activePosition, mode: state.mode === "focus" ? "focus" : view.layout.mode });
  }, [onRenderedMode, state.mode, view.activePosition, view.layout.mode]);

  return (
    <section className="reader-surface" data-testid="reader-surface" aria-label={`${document.title} reading surface`}>
      <div className="reader-surface__zone" ref={zoneRef}>
        <div className="reader-surface__rail" aria-hidden="true" />
        {state.mode === "focus" ? <FocusWord token={view.activeToken} offset={railOffset} /> : <ContextWords layout={view.layout} />}
        <span ref={measureRef} className="reader-surface__measure" aria-hidden="true" />
        <canvas ref={canvasRef} className="reader-surface__canvas" aria-hidden="true" />
      </div>
      <p className="reader-surface__section">Section {view.activePosition.sectionIndex + 1}</p>
    </section>
  );
}
