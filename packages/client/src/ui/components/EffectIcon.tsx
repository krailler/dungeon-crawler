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
  /** "normal" = BuffBar size (32px), "small" = TargetFrame size (20px) */
  size?: "normal" | "small";
};

export const EffectIcon = ({
  effectId,
  remaining,
  duration,
  stacks,
  def,
  size = "normal",
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

  const isSmall = size === "small";

  return (
    <div
      className="group pointer-events-auto relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        className={[
          "relative flex items-center justify-center rounded-lg border shadow-md shadow-black/30",
          isSmall ? "h-5 w-5 rounded" : "h-8 w-8",
          isDebuff ? "border-red-500/50 bg-red-950/60" : "border-emerald-500/50 bg-emerald-950/60",
        ].join(" ")}
      >
        <IconComponent className={isSmall ? "h-3 w-3 text-slate-200" : "h-5 w-5 text-slate-200"} />
        {/* Timer sweep overlay */}
        <div
          className={["absolute inset-0 bg-black/50", isSmall ? "rounded" : "rounded-lg"].join(" ")}
          style={{ clipPath: `inset(${100 - pct}% 0 0 0)` }}
        />
        {/* Stacks badge */}
        {stacks > 1 && (
          <span
            className={[
              "absolute flex items-center justify-center rounded-full bg-slate-800 font-bold text-white ring-1 ring-slate-600",
              isSmall
                ? "-bottom-0.5 -right-0.5 h-2.5 min-w-2.5 px-0.5 text-[6px]"
                : "-bottom-1 -right-1 h-3.5 min-w-3.5 px-0.5 text-[8px]",
            ].join(" ")}
          >
            {stacks}
          </span>
        )}
      </div>
      {/* Timer text below icon (only for normal size) */}
      {!isSmall && (
        <div className="mt-0.5 text-center text-[8px] font-medium text-slate-400">
          {remainingSec}s
        </div>
      )}
      {/* Tooltip on hover */}
      {hovered && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-50 whitespace-nowrap rounded-lg border border-slate-600/40 bg-slate-900/95 px-3 py-2 text-center shadow-xl backdrop-blur-sm">
          <div className="text-[11px] font-semibold text-slate-100">{displayName}</div>
          {description && <div className="mt-0.5 text-[10px] text-slate-400">{description}</div>}
          <div className="mt-1 text-[10px] text-amber-400/80">{remainingSec}s</div>
        </div>
      )}
    </div>
  );
};
