import { useEffect, useMemo, useRef, useState } from "react";

import type { Document, Token } from "../../domain/document";
import type { ReaderPosition, ReaderState } from "../../domain/reader-state";
import { computePivotOffset } from "../../lib/reader/pivot";
import type { ContextWindowResult } from "../../lib/reader/context-window";
import type { LayoutModeReport, ReaderViewModel } from "./useReaderController";

export type ReaderSurfaceProps = {
  document: Document;
  state: ReaderState;
  view: ReaderViewModel;
  onRenderedMode(report: LayoutModeReport): void;
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
      {layout.mode === "long-word-hold" ? <span className="reader-context__long-word" style={{ transform: `scaleX(${layout.scaleX})`, transformOrigin: `${layout.active.beforePivotWidth + layout.active.pivotWidth / 2}px center` }} aria-hidden="true">{layout.active.token.text}</span> : null}
    </div>
  );
}

export function ReaderSurface({ document, state, view, onRenderedMode }: ReaderSurfaceProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const [railOffset, setRailOffset] = useState(0);
  const measurement = useMemo(() => {
    const graphemeWidth = 16 * state.settings.fontScale;
    return computePivotOffset({ beforeWidth: view.activeToken.pivotIndex * graphemeWidth, pivotWidth: graphemeWidth, railX: 0 });
  }, [state.settings.fontScale, view.activeToken]);

  useEffect(() => {
    const zone = zoneRef.current;
    const measure = () => {
      const width = zone?.getBoundingClientRect().width ?? 0;
      const graphemeWidth = 16 * state.settings.fontScale;
      setRailOffset(computePivotOffset({ beforeWidth: view.activeToken.pivotIndex * graphemeWidth, pivotWidth: graphemeWidth, railX: width / 2 }));
    };
    measure();
    if (typeof ResizeObserver !== "undefined" && zone) {
      const observer = new ResizeObserver(measure);
      observer.observe(zone);
      return () => observer.disconnect();
    }
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [state.settings.fontScale, view.activeToken]);

  useEffect(() => {
    onRenderedMode({ position: view.activePosition, mode: state.mode === "focus" ? "focus" : view.layout.mode });
  }, [onRenderedMode, state.mode, view.activePosition, view.layout.mode]);

  return (
    <section className="reader-surface" data-testid="reader-surface" aria-label={`${document.title} reading surface`}>
      <div className="reader-surface__zone" ref={zoneRef}>
        <div className="reader-surface__rail" aria-hidden="true" />
        {state.mode === "focus" ? <FocusWord token={view.activeToken} offset={railOffset || measurement} /> : <ContextWords layout={view.layout} />}
      </div>
      <p className="reader-surface__section">Section {view.activePosition.sectionIndex + 1}</p>
    </section>
  );
}
