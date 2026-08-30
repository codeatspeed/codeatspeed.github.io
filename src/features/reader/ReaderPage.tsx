import { useCallback, useState } from "react";

import ModalLayer from "../../components/ModalLayer";
import type { Document } from "../../domain/document";
import type { ReaderNotice } from "../../domain/reader-state";
import { SettingsDrawer } from "../settings/SettingsDrawer";
import { ReaderControls } from "./ReaderControls";
import { ReaderSurface } from "./ReaderSurface";
import { useReaderController } from "./useReaderController";
import "../../styles/reader.css";

export type ReaderPageProps = {
  document: Document;
  initialNotice?: ReaderNotice;
};
export function ReaderPage({ document, initialNotice }: ReaderPageProps) {
  const controller = useReaderController(document, initialNotice);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeExpanded = useCallback(() => controller.setExpanded(false), [controller.setExpanded]);
  const reader = (
    <div className="reader-page__inner">
      <ReaderSurface document={document} state={controller.state} view={controller.view} onRenderedMode={controller.setRenderedMode} onSurfaceMetrics={controller.setSurfaceMetrics} />
      <ReaderControls
        document={document}
        state={controller.state}
        progress={controller.view.progress}
        disabled={controller.state.status === "loading"}
        onPrevious={controller.stepPrevious}
        onTogglePlayback={controller.togglePlayback}
        onNext={controller.stepNext}
        onRestart={controller.restartFromCurrentSection}
        onWpm={controller.setWpm}
        onMode={controller.setMode}
        onPhraseSize={controller.setPhraseSize}
        onExpanded={() => controller.setExpanded(true)}
        onSettings={openSettings}
        onBack={() => controller.state.expanded ? controller.setExpanded(false) : window.history.back()}
        onDismissNotice={controller.dismissNotice}
      />
      <p className="reader-announcement visually-hidden" data-testid="reader-announcement" aria-live="polite">{controller.announcement}</p>
    </div>
  );
  return (
    <main className={`reader-page${controller.state.expanded ? " reader-page--expanded" : ""}${controller.state.settings.contrast === "high" ? " reader-page--high-contrast" : ""}${controller.state.settings.reducedMotion ? " reader-page--reduced-motion" : ""}`}>
      {controller.state.expanded ? <ModalLayer open label="Expanded reader" onClose={closeExpanded}>{reader}</ModalLayer> : reader}
      {settingsOpen ? <SettingsDrawer settings={controller.state.settings} disabled={controller.state.status === "loading"} onChange={controller.setSettings} onClose={closeSettings} /> : null}
    </main>
  );
}

export default ReaderPage;
