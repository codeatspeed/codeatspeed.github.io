import { useEffect, useRef, useState } from "react";

import { READER_SETTINGS_LIMITS, type ReaderSettings } from "../../domain/settings";

export type SettingsDrawerProps = {
  settings: ReaderSettings;
  onChange: (settings: ReaderSettings) => void;
  onClose: () => void;
  disabled?: boolean;
};

export function SettingsDrawer({ settings, onChange, onClose, disabled = false }: SettingsDrawerProps) {
  const drawerRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [wpmInput, setWpmInput] = useState(String(settings.wpm));
  const [phraseSizeInput, setPhraseSizeInput] = useState(String(settings.phraseSize));

  useEffect(() => {
    if (wpmInput !== "" && Number(wpmInput) !== settings.wpm) setWpmInput(String(settings.wpm));
  }, [settings.wpm, wpmInput]);
  useEffect(() => {
    if (phraseSizeInput !== "" && Number(phraseSizeInput) !== settings.phraseSize) setPhraseSizeInput(String(settings.phraseSize));
  }, [phraseSizeInput, settings.phraseSize]);
  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const drawer = drawerRef.current;
    const focusable = () => [...(drawer?.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])") ?? [])]
      .filter((item) => !item.hasAttribute("disabled"));
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        event.stopPropagation();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        event.stopPropagation();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      openerRef.current?.focus();
    };
  }, [onClose]);

  const change = <K extends keyof ReaderSettings>(key: K, value: ReaderSettings[K]) => {
    onChange({ ...settings, [key]: value });
  };

  return (
    <aside ref={drawerRef} className="settings-drawer" role="dialog" aria-modal="true" aria-labelledby="reader-settings-title">
      <div className="settings-drawer__header">
        <h2 id="reader-settings-title">Reader settings</h2>
        <button type="button" onClick={onClose} aria-label="Close settings">Close</button>
      </div>
      <div className="settings-drawer__fields">
        <label>
          Words per minute
          <input
            type="number"
            min={READER_SETTINGS_LIMITS.wpm.min}
            max={READER_SETTINGS_LIMITS.wpm.max}
            step="10"
            value={wpmInput}
            aria-label="Settings words per minute"
            aria-valuenow={settings.wpm}
            aria-valuetext={`${settings.wpm} words per minute`}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              setWpmInput(value);
              if (value !== "") change("wpm", Number(value));
            }}
          />
        </label>
        <label>
          Phrase size
          <input
            type="number"
            min={READER_SETTINGS_LIMITS.phraseSize.min}
            max={READER_SETTINGS_LIMITS.phraseSize.max}
            value={phraseSizeInput}
            aria-label="Settings phrase size"
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              setPhraseSizeInput(value);
              if (value !== "") change("phraseSize", Number(value));
            }}
          />
        </label>
        <label>
          Font scale
          <input
            type="number"
            min={READER_SETTINGS_LIMITS.fontScale.min}
            max={READER_SETTINGS_LIMITS.fontScale.max}
            step="0.05"
            value={settings.fontScale}
            disabled={disabled}
            onChange={(event) => change("fontScale", Number(event.target.value))}
          />
        </label>
        <label>
          Contrast
          <select value={settings.contrast} disabled={disabled} onChange={(event) => change("contrast", event.target.value as ReaderSettings["contrast"])}>
            <option value="default">Default</option>
            <option value="high">High contrast</option>
          </select>
        </label>
        <label>
          Pause profile
          <select value={settings.pauseProfile} disabled={disabled} onChange={(event) => change("pauseProfile", event.target.value as ReaderSettings["pauseProfile"])}>
            <option value="minimal">Minimal</option>
            <option value="balanced">Balanced</option>
            <option value="generous">Generous</option>
          </select>
        </label>
        <label className="settings-drawer__toggle">
          <input type="checkbox" checked={settings.reducedMotion} disabled={disabled} onChange={(event) => change("reducedMotion", event.target.checked)} />
          Reduced motion
        </label>
        <label className="settings-drawer__toggle">
          <input type="checkbox" checked={settings.showContextByDefault} disabled={disabled} onChange={(event) => change("showContextByDefault", event.target.checked)} />
          Show context by default
        </label>
      </div>
    </aside>
  );
}

export default SettingsDrawer;
