import { useEffect, useState } from "react";

import type { Document } from "../../domain/document";
import type { ReaderState } from "../../domain/reader-state";

export type ReaderControlsProps = {
  document: Document;
  state: ReaderState;
  progress: number;
  disabled?: boolean;
  onPrevious: () => void;
  onTogglePlayback: () => void;
  onNext: () => void;
  onRestart: () => void;
  onWpm: (value: number) => void;
  onMode: (mode: "focus" | "context") => void;
  onPhraseSize: (value: number) => void;
  onExpanded: () => void;
  onSettings: () => void;
  onBack: () => void;
  onDismissNotice: () => void;
};
export function ReaderControls({ document, state, progress, disabled = false, onPrevious, onTogglePlayback, onNext, onRestart, onWpm, onMode, onPhraseSize, onExpanded, onSettings, onBack, onDismissNotice }: ReaderControlsProps) {
  const playing = state.status === "playing";
  const [wpmInput, setWpmInput] = useState(String(state.settings.wpm));
  useEffect(() => {
    if (wpmInput !== "" && Number(wpmInput) !== state.settings.wpm) setWpmInput(String(state.settings.wpm));
  }, [state.settings.wpm, wpmInput]);
  return (
    <div className="reader-controls" data-testid="reader-controls">
      <div className="reader-controls__meta">
        <button type="button" className="reader-controls__back" onClick={onBack}>Back</button>
        <div>
          <p className="reader-controls__eyebrow">Reading chapter</p>
          <h1>{document.title}</h1>
          {document.author ? <p className="reader-controls__author">by {document.author}</p> : null}
        </div>
        <div className="reader-controls__meta-actions">
          <button type="button" onClick={onExpanded} aria-label="Expand reader">Expand</button>
          <button type="button" onClick={onSettings} aria-label="Settings">Settings</button>
        </div>
      </div>
      {state.notice ? (
        <div className="reader-controls__notice" role="status" aria-live="polite" aria-atomic="true">
          <span>{state.notice.message}</span>
          <button type="button" onClick={onDismissNotice} aria-label="Dismiss notice">Dismiss</button>
        </div>
      ) : null}
      <div className="reader-controls__actions" aria-label="Playback controls">
        <button type="button" onClick={onPrevious} disabled={disabled} aria-label="Previous">Previous</button>
        <button type="button" data-reader-play-toggle="true" onClick={onTogglePlayback} disabled={disabled} aria-label={playing ? "Pause" : "Resume"}>{playing ? "Pause" : "Resume"}</button>
        <button type="button" onClick={onNext} disabled={disabled} aria-label="Next">Next</button>
        {(state.status === "error" || state.status === "complete") ? <button type="button" onClick={onRestart} aria-label="Restart current section">Restart</button> : null}
      </div>
      <div className="reader-controls__settings">
        <label>
          Words per minute
          <input type="number" min="1" max="10000" step="10" value={wpmInput} onChange={(event) => {
            const value = event.target.value;
            setWpmInput(value);
            if (value !== "") onWpm(Number(value));
          }} disabled={disabled} aria-label="Words per minute" aria-valuenow={state.settings.wpm} aria-valuetext={`${state.settings.wpm} words per minute`} />
        </label>
        <span aria-label="Actual words per minute">{state.settings.wpm} WPM</span>
        <div className="reader-controls__modes" aria-label="Reading mode">
          <button type="button" onClick={() => onMode("focus")} aria-pressed={state.mode === "focus"}>Focus</button>
          <button type="button" onClick={() => onMode("context")} aria-pressed={state.mode === "context"}>Context</button>
        </div>
        {state.mode === "context" ? (
          <label>
            Phrase size
            <input type="number" min="1" max="12" value={state.settings.phraseSize} onChange={(event) => onPhraseSize(Number(event.target.value))} disabled={disabled} aria-label="Phrase size" />
          </label>
        ) : null}
      </div>
      <div className="reader-controls__progress">
        <span>Progress</span>
        <progress max="100" value={progress * 100} aria-valuenow={Math.round(progress * 100)} aria-valuetext={`${Math.round(progress * 100)} percent`} aria-label="Reading progress" />
        <span>{Math.round(progress * 100)}%</span>
      </div>
    </div>
  );
}
