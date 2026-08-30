import type { ReactNode } from "react";

type ErrorNoticeProps = {
  message: string;
  onDismiss?: () => void;
  children?: ReactNode;
};

export function ErrorNotice({ message, onDismiss, children }: ErrorNoticeProps) {
  return (
    <div className="error-notice" role="alert" aria-live="assertive">
      <p>{message}</p>
      {children}
      {onDismiss === undefined ? null : (
        <button type="button" onClick={onDismiss} aria-label="Dismiss notice">
          Dismiss
        </button>
      )}
    </div>
  );
}

export default ErrorNotice;
