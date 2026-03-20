import type { ReactNode } from "react";
import { healthColor } from "../utils/healthColor";

type ProgressBarColor = "health" | "xp" | "emerald";

type ProgressBarProps = {
  value: number;
  max: number;
  color: ProgressBarColor;
  /** Height: "xs" = 2px, "sm" = 8px, "md" = 10px */
  size?: "xs" | "sm" | "md";
  className?: string;
};

const SIZE_CLASS = {
  xs: "h-[2px]",
  sm: "h-2",
  md: "h-2.5",
};

const FILL_COLORS: Record<Exclude<ProgressBarColor, "health">, string> = {
  xp: "bg-gradient-to-r from-purple-400/90 to-violet-500/80",
  emerald: "bg-gradient-to-r from-emerald-600 to-emerald-400",
};

export const ProgressBar = ({
  value,
  max,
  color,
  size = "sm",
  className = "",
}: ProgressBarProps): ReactNode => {
  const safeMax = Math.max(1, max);
  const pct = Math.max(0, Math.min(100, (value / safeMax) * 100));

  const fillClass =
    color === "health" ? `bg-gradient-to-r ${healthColor(pct)}` : FILL_COLORS[color];

  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-slate-900/80 ${SIZE_CLASS[size]} ${className}`}
    >
      <div
        className={`h-full rounded-full ${fillClass} transition-[width] duration-300`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
};
