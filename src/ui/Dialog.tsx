/**
 * Dialog -- generic modal dialog primitive (task 2.3 Chain A).
 *
 * Uses the native HTML <dialog> element: backdrop, Escape-to-close, and
 * focus management are browser-provided. showModal() is called on mount.
 *
 * Mount/unmount pattern -- parent controls visibility:
 *   {open && <Dialog title="..." onClose={fn}>...</Dialog>}
 *
 * FR-U006 / FR-U007 / FR-U008 / FR-U009.
 */

import { useEffect, useRef, type ReactNode } from "react";

interface DialogProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** data-testid on the <dialog> element. Defaults to "gw-dialog". */
  testId?: string;
}

export function Dialog({
  title,
  onClose,
  children,
  testId = "gw-dialog",
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  /** Stable ref so the single-mount effect always calls the latest onClose. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const el = ref.current;
    if (el == null) return;
    const handleClose = () => {
      onCloseRef.current();
    };
    el.addEventListener("close", handleClose);
    if (!el.open) el.showModal();
    return () => {
      // Remove listener BEFORE el.close() so the close event fired by
      // el.close() has no listener and does not re-call onClose.
      el.removeEventListener("close", handleClose);
      if (el.open) el.close();
    };
  }, []);

  return (
    <dialog ref={ref} className="gw-dialog" data-testid={testId}>
      <div className="gw-dialog-header">
        <h2 className="gw-dialog-title">{title}</h2>
        <button
          type="button"
          className="gw-dialog-close"
          onClick={onClose}
          aria-label="Close dialog"
        >
          &#x2715;
        </button>
      </div>
      <div className="gw-dialog-body">{children}</div>
    </dialog>
  );
}
