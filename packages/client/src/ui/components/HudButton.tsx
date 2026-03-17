import { useCallback, useEffect } from "react";
import type { ReactNode } from "react";
import { playUiSfx } from "../../audio/uiSfx";

type HudButtonProps = {
  onClick: () => void;
  /** Whether the associated panel is currently open */
  isOpen?: boolean;
  /** Visual style variant */
  variant?: "default" | "amber";
  /** Keyboard shortcut that toggles onClick (case-insensitive, ignored when typing in inputs) */
  shortcut?: string;
  /** Icon element (SVG or emoji) */
  icon?: ReactNode;
  /** Button label text */
  label: string;
  /** Extra content rendered after the shortcut badge */
  suffix?: ReactNode;
};

const baseClass =
  "pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium shadow-lg shadow-black/30 backdrop-blur-md transition-all";

const variantClass = (variant: "default" | "amber", isOpen: boolean): string => {
  if (variant === "amber") {
    return isOpen
      ? "border-amber-400/50 bg-amber-900/40 text-amber-300"
      : "border-amber-500/30 bg-slate-900/60 text-amber-400 hover:border-amber-400/50 hover:bg-slate-800/90";
  }
  return isOpen
    ? "border-sky-400/50 bg-sky-900/40 text-sky-300"
    : "border-slate-500/30 bg-slate-900/60 text-slate-300 hover:border-slate-400/40 hover:text-slate-200";
};

const kbdClass = (variant: "default" | "amber"): string =>
  variant === "amber"
    ? "rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-mono text-amber-400/60"
    : "rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-mono text-slate-400";

export const HudButton = ({
  onClick,
  isOpen = false,
  variant = "default",
  shortcut,
  icon,
  label,
  suffix,
}: HudButtonProps): ReactNode => {
  const handleClick = useCallback(() => {
    playUiSfx("ui_click");
    onClick();
  }, [onClick]);

  // Register keyboard shortcut (case-insensitive, skips when typing in inputs)
  useEffect(() => {
    if (!shortcut) return;
    const lower = shortcut.toLowerCase();
    const handleKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === lower) handleClick();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [shortcut, handleClick]);

  return (
    <button onClick={handleClick} className={`${baseClass} ${variantClass(variant, isOpen)}`}>
      {icon}
      <span className="uppercase tracking-wider">{label}</span>
      {shortcut && <kbd className={kbdClass(variant)}>{shortcut}</kbd>}
      {suffix}
    </button>
  );
};
