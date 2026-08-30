import { useEffect, useRef, useState, type ReactNode } from "react";

export type ModalLayerProps = {
  open: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
};

export function ModalLayer({ open, label, onClose, children }: ModalLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const layer = layerRef.current;
    const focusable = layer?.querySelector<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])");
    focusable?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !layer) return;
      const items = [...layer.querySelectorAll<HTMLElement>("button, input, select, textarea, a[href], [tabindex]:not([tabindex='-1'])")].filter((item) => !item.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      openerRef.current?.focus();
    };
  }, [onClose, open]);
  useEffect(() => {
    if (!open) {
      setIdle(false);
      return;
    }
    let timer: number | undefined;
    const activity = () => {
      setIdle(false);
      if (timer !== undefined) window.clearTimeout(timer);
      timer = window.setTimeout(() => setIdle(true), 1800);
    };
    activity();
    window.addEventListener("pointermove", activity);
    window.addEventListener("touchstart", activity);
    window.addEventListener("keydown", activity);
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener("pointermove", activity);
      window.removeEventListener("touchstart", activity);
      window.removeEventListener("keydown", activity);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className={`modal-layer${idle ? " modal-layer--idle" : ""}`} data-testid="modal-layer" role="dialog" aria-modal="true" aria-label={label} ref={layerRef}>
      <button type="button" className="modal-layer__backdrop" aria-label="Close expanded reader" onClick={onClose} />
      <div className="modal-layer__content">{children}</div>
    </div>
  );
}

export default ModalLayer;
