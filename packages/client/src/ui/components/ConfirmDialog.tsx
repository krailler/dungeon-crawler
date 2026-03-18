import { useEffect } from "react";
import type { ReactNode } from "react";
import { MenuButton } from "./MenuButton";

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
  /**
   * "fullscreen" (default) — centered overlay with backdrop blur, for top-level dialogs.
   * "inline" — no backdrop, transparent bg, fits inside a parent panel.
   */
  variant?: "fullscreen" | "inline";
};

export const ConfirmDialog = ({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  variant = "fullscreen",
}: ConfirmDialogProps): ReactNode => {
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

  if (variant === "inline") {
    return (
      <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
        <div className="w-64 p-4">
          <h2 className="mb-2 text-center text-base font-bold text-amber-400">{title}</h2>
          <p className="mb-4 text-center text-xs text-slate-400">{message}</p>
          <div className="flex gap-2">
            <MenuButton onClick={onCancel} className="flex-1">
              {cancelLabel}
            </MenuButton>
            <MenuButton variant="accent" onClick={onConfirm} className="flex-1">
              {confirmLabel}
            </MenuButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-80 rounded-2xl border border-amber-500/30 bg-slate-900/95 p-6 shadow-2xl shadow-black/50 backdrop-blur">
        <h2 className="mb-2 text-center text-lg font-bold text-amber-400">{title}</h2>
        <p className="mb-6 text-center text-sm text-slate-400">{message}</p>
        <div className="flex gap-3">
          <MenuButton onClick={onCancel} className="flex-1">
            {cancelLabel}
          </MenuButton>
          <MenuButton variant="accent" onClick={onConfirm} className="flex-1">
            {confirmLabel}
          </MenuButton>
        </div>
      </div>
    </div>
  );
};
