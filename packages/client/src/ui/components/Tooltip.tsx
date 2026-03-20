import type { ReactNode } from "react";

type TooltipProps = {
  /** Tooltip content (text or rich JSX) */
  content: ReactNode;
  /** Direction the tooltip appears relative to children */
  position?: "top" | "bottom";
  /** Optional width constraint (e.g. "w-48") */
  width?: string;
  /** The element that triggers the tooltip on hover */
  children: ReactNode;
  /** Extra class on the tooltip bubble */
  className?: string;
};

const positionClass = {
  top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
  bottom: "left-0 top-full mt-1",
};

export const Tooltip = ({
  content,
  position = "top",
  width,
  children,
  className = "",
}: TooltipProps): ReactNode => {
  // If no content, render children without wrapper
  if (!content) return <>{children}</>;

  return (
    <div className="group/tip relative">
      {children}
      <div
        className={`pointer-events-none absolute z-50 hidden max-w-sm rounded-lg border border-zinc-600 bg-zinc-900/95 px-2 py-1 text-[11px] text-zinc-300 shadow-lg group-hover/tip:block ${positionClass[position]} ${width ?? "whitespace-nowrap"} ${className}`}
      >
        {content}
      </div>
    </div>
  );
};
