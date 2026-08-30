import { useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";

import { ErrorNotice } from "../../components/ErrorNotice";
import {
  importEpubFile,
  importPastedText,
  ImportInputError,
  type ImportResult,
} from "./import-controller";

export type ImportPageProps = {
  onImported: (result: ImportResult) => void;
};

const SAMPLE_TEXT =
  "Make space for the next word.\n\nA quiet page can become a place to focus, one clear sentence at a time.";

export function ImportPage({ onImported }: ImportPageProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [paste, setPaste] = useState("");
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState("Choose an EPUB or paste text to begin.");
  const [busy, setBusy] = useState(false);

  const runImport = async (operation: () => Promise<ImportResult>) => {
    setBusy(true);
    setError(undefined);
    setStatus("Preparing your reading space…");
    try {
      const result = await operation();
      setStatus("Import complete. Opening your reading space.");
      onImported(result);
    } catch (caught) {
      const message = caught instanceof ImportInputError
        ? caught.message
        : "We couldn't import that content. Try an EPUB or paste text instead.";
      setError(message);
      setStatus("Import needs attention.");
    } finally {
      setBusy(false);
    }
  };

  const onFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file !== undefined) await runImport(() => importEpubFile(file));
    event.target.value = "";
  };

  const openPicker = () => fileInput.current?.click();

  const onDrop = async (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file !== undefined) await runImport(() => importEpubFile(file));
  };

  const onDropZoneKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPicker();
    }
  };

  const importPaste = () => {
    if (paste.trim().length === 0) {
      setError("Paste some text with at least one word to begin reading.");
      setStatus("Import needs attention.");
      return;
    }
    void runImport(() => importPastedText(paste));
  };

  const importSample = () => {
    setPaste(SAMPLE_TEXT);
    void runImport(() => importPastedText(SAMPLE_TEXT));
  };

  return (
    <main className="app-shell import-page">
      <header className="import-page__header">
        <div className="app-shell__eyebrow">Read / Focus</div>
        <p className="import-page__mark" aria-label="Read Focus product mark">RF</p>
        <h1>Make space for the next word.</h1>
        <p className="import-page__promise">
          A quiet, local reading space for books and notes you want to stay with.
        </p>
      </header>

      <section className="import-page__content" aria-labelledby="import-title">
        <h2 id="import-title">Bring something to read</h2>
        <div
          className="import-page__drop-zone"
          role="button"
          tabIndex={busy ? -1 : 0}
          aria-label="Drop an EPUB here or choose a file"
          onKeyDown={onDropZoneKeyDown}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          <strong>Drop an EPUB here</strong>
          <span>or choose a file from this device</span>
          <input
            ref={fileInput}
            type="file"
            accept=".epub,application/epub+zip"
            aria-label="EPUB file"
            onClick={(event) => event.stopPropagation()}
            onChange={onFileChange}
            disabled={busy}
          />
        </div>

        <div className="import-page__paste">
          <label htmlFor="paste-text">Paste text</label>
          <textarea
            id="paste-text"
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            placeholder="Paste a chapter, essay, or note…"
            rows={7}
            disabled={busy}
          />
          <div className="import-page__actions">
            <button type="button" onClick={importPaste} disabled={busy}>
              Import pasted text
            </button>
            <button type="button" className="button-secondary" onClick={importSample} disabled={busy}>
              Try a sample
            </button>
          </div>
        </div>

        {error === undefined ? null : (
          <ErrorNotice message={error} onDismiss={() => setError(undefined)} />
        )}
        <div className="import-page__status" role="status" aria-live="polite" aria-atomic="true">
          {status}
        </div>
        <p className="import-page__privacy">
          Your reading stays on this device. Files and pasted text are processed locally and never uploaded.
        </p>
        <a href="#help" className="import-page__help">Need help importing an EPUB?</a>
      </section>

      <footer className="import-page__footer">Read with less noise.</footer>
    </main>
  );
}

export default ImportPage;
