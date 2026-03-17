import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { EffectDef } from "@dungeon/shared";
import { WeaknessIcon } from "../icons/WeaknessIcon";

/** Map icon identifiers to SVG components */
const EFFECT_ICONS: Record<string, (props: { className?: string }) => ReactNode> = {
  weakness: WeaknessIcon,
};

const DefaultIcon = ({ className = "h-5 w-5" }: { className?: string }): ReactNode => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M12 8v4M12 16h.01" />
  </svg>
);

type EffectIconProps = {
  effectId: string;
  remaining: number;
  duration: number;
  stacks: number;
  def?: EffectDef;
  /** Direction the tooltip opens: "up" (default) or "down" */
  tooltipDir?: "up" | "down";
};

export const EffectIcon = ({
  effectId,
  remaining,
  duration,
  stacks,
  def,
  tooltipDir = "up",
}: EffectIconProps): ReactNode => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  const isDebuff = def?.isDebuff ?? true;
  const IconComponent = EFFECT_ICONS[def?.icon ?? ""] ?? DefaultIcon;
  const pct = duration > 0 ? (remaining / duration) * 100 : 0;
  const remainingSec = Math.max(0, remaining).toFixed(1);
  const displayName = def ? t(def.name, { defaultValue: def.name }) : effectId;

  // Extract primary modifier value for i18n interpolation
  const primaryMod = def ? Object.values(def.statModifiers)[0] : undefined;
  const modValue = primaryMod ? Math.abs(primaryMod.value * 100) : 0;
  const description = def ? t(def.description, { value: modValue, defaultValue: "" }) : "";

  const tooltipPosition =
    tooltipDir === "up"
      ? "bottom-full left-1/2 mb-2 -translate-x-1/2"
      : "top-full left-1/2 mt-2 -translate-x-1/2";

  return (
    <div
      className="group pointer-events-auto relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={[
          "relative flex h-7 w-7 items-center justify-center rounded border shadow-md shadow-black/30",
          isDebuff ? "border-red-500/50 bg-red-950/60" : "border-emerald-500/50 bg-emerald-950/60",
        ].join(" ")}
      >
        <IconComponent className="h-4 w-4 text-slate-200" />
        {/* Timer sweep overlay */}
        <div
          className="absolute inset-0 rounded bg-black/50"
          style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}
        />
        {/* Stacks badge */}
        {stacks > 1 && (
          <span className="absolute -bottom-1 -right-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-slate-800 px-0.5 text-[7px] font-bold text-white ring-1 ring-slate-600">
            {stacks}
          </span>
        )}
      </div>
      {/* Timer text below icon */}
      <div className="mt-0.5 text-center text-[8px] font-medium text-slate-400">
        {remainingSec}s
      </div>
      {/* Tooltip on hover */}
      {hovered && (
        <div
          className={[
            "pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-slate-600/40 bg-slate-900/95 px-3 py-2 text-center shadow-xl backdrop-blur-sm",
            tooltipPosition,
          ].join(" ")}
        >
          <div className="text-[11px] font-semibold text-slate-100">{displayName}</div>
          {description && <div className="mt-0.5 text-[10px] text-slate-400">{description}</div>}
        </div>
      )}
    </div>
  );
};
