import type { ReactNode } from "react";
import { playUiSfx } from "../../audio/uiSfx";

type MenuButtonVariant = "default" | "danger" | "accent";

type MenuButtonProps = {
  onClick: () => void;
  variant?: MenuButtonVariant;
  /** Extra Tailwind classes (e.g. "w-full", "flex-1") */
  className?: string;
  children: ReactNode;
};

const variantClasses: Record<MenuButtonVariant, string> = {
  default:
    "border-slate-600/40 bg-slate-800/80 text-slate-300 font-medium hover:border-slate-500/60 hover:bg-slate-700/80 hover:text-slate-100",
  danger:
    "border-red-500/30 bg-slate-800/80 text-red-400 font-medium hover:border-red-400/50 hover:bg-red-950/40 hover:text-red-300",
  accent:
    "border-amber-500/40 bg-amber-600/20 text-amber-300 font-bold hover:border-amber-400/60 hover:bg-amber-600/30 hover:text-amber-200",
};

export const MenuButton = ({
  onClick,
  variant = "default",
  className = "",
  children,
}: MenuButtonProps): ReactNode => (
  <button
    onClick={() => {
      playUiSfx("ui_click");
      onClick();
    }}
    className={`rounded-xl border px-4 py-2.5 text-sm transition-colors ${variantClasses[variant]} ${className}`}
  >
    {children}
  </button>
);
