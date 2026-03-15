import { useEffect } from "react";
import { playUiSfx } from "../../audio/uiSfx";

type ConfirmDialogProps = {
  /** Dialog title */
  title: string;
  /** Dialog message / description */
  message: string;
  /** Label for the confirm button */
  confirmLabel: string;
  /** Label for the cancel button */
  cancelLabel: string;
  /** Called when the user confirms */
  onConfirm: () => void;
  /** Called when the user cancels (button or Escape key) */
  onCancel: () => void;
};

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element => {
  // Close on Escape — capture phase so it runs before bubble-phase listeners (PauseMenu, etc.)
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onCancel]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-80 rounded-2xl border border-amber-500/30 bg-slate-900/95 p-6 shadow-2xl shadow-black/50 backdrop-blur">
        <h2 className="mb-2 text-center text-lg font-bold text-amber-400">{title}</h2>
        <p className="mb-6 text-center text-sm text-slate-400">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={() => {
              playUiSfx("ui_click");
              onCancel();
            }}
            className="flex-1 rounded-xl border border-slate-600/40 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500/60 hover:bg-slate-700/80 hover:text-slate-100"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => {
              playUiSfx("ui_click");
              onConfirm();
            }}
            className="flex-1 rounded-xl border border-amber-500/40 bg-amber-600/20 px-4 py-2 text-sm font-bold text-amber-300 transition-colors hover:border-amber-400/60 hover:bg-amber-600/30 hover:text-amber-200"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
