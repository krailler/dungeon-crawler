import type { ReactNode } from "react";

type BadgeVariant = "level" | "status" | "notification";
type BadgeColor = "sky" | "amber" | "red" | "slate";

type BadgeProps = {
  variant?: BadgeVariant;
  color?: BadgeColor;
  pulse?: boolean;
  children: ReactNode;
  className?: string;
};

const STATUS_COLORS: Record<BadgeColor, string> = {
  sky: "bg-sky-500/20 text-sky-400",
  amber: "bg-amber-900/50 text-amber-400",
  red: "bg-red-900/50 text-red-400",
  slate: "bg-slate-700/50 text-slate-500",
};

const NOTIFICATION_COLORS: Record<BadgeColor, string> = {
  sky: "bg-sky-500",
  amber: "bg-amber-500",
  red: "bg-red-500",
  slate: "bg-slate-500",
};

export const Badge = ({
  variant = "level",
  color = "sky",
  pulse = false,
  children,
  className = "",
}: BadgeProps): ReactNode => {
  if (variant === "notification") {
    return (
      <span
        className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white shadow ${NOTIFICATION_COLORS[color]} ${pulse ? "animate-pulse" : ""} ${className}`}
      >
        {children}
      </span>
    );
  }

  if (variant === "status") {
    return (
      <span
        className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${STATUS_COLORS[color]} ${className}`}
      >
        {children}
      </span>
    );
  }

  // level (default)
  return (
    <span
      className={`rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-400 ${className}`}
    >
      {children}
    </span>
  );
};
