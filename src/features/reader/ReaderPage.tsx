import { useCallback } from "react";

import ModalLayer from "../../components/ModalLayer";
import type { Document } from "../../domain/document";
import type { ReaderNotice } from "../../domain/reader-state";
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
        onBack={() => controller.state.expanded ? controller.setExpanded(false) : window.history.back()}
        onDismissNotice={controller.dismissNotice}
      />
      <p className="reader-announcement visually-hidden" role="status" aria-live="polite">{controller.announcement}</p>
    </div>
  );
  return (
    <main className={`reader-page${controller.state.expanded ? " reader-page--expanded" : ""}`}>
      {controller.state.expanded ? <ModalLayer open label="Expanded reader" onClose={closeExpanded}>{reader}</ModalLayer> : reader}
    </main>
  );
}

export default ReaderPage;
