import type { ReactNode } from "react";

type HudPillProps = {
  children: ReactNode;
  /** Visual style variant */
  variant?: "default" | "amber";
  /** Use monospace font */
  mono?: boolean;
};

const variantStyles = {
  default: "border-slate-500/30 text-slate-300",
  amber: "border-amber-500/30 text-amber-300",
} as const;

export const HudPill = ({
  children,
  variant = "default",
  mono = false,
}: HudPillProps): JSX.Element => (
  <div
    className={[
      "rounded-full border bg-slate-900/60 px-3 py-1 text-[11px] backdrop-blur",
      variantStyles[variant],
      mono && "font-mono",
    ]
      .filter(Boolean)
      .join(" ")}
  >
    {children}
  </div>
);
