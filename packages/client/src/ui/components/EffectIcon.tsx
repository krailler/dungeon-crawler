import { useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { EffectDefClient } from "@dungeon/shared";
import { ItemIcon } from "./ItemIcon";

type EffectIconProps = {
  effectId: string;
  remaining: number;
  duration: number;
  stacks: number;
  def?: EffectDefClient;
  /** Pre-computed modifier value from server (e.g. 25 for -25%) */
  modValue?: number;
  /** Direction the tooltip opens: "up" (default) or "down" */
  tooltipDir?: "up" | "down";
};

export const EffectIcon = ({
  effectId,
  remaining,
  duration,
  stacks,
  def,
  modValue: serverModValue,
  tooltipDir = "up",
}: EffectIconProps): ReactNode => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);

  const isDebuff = def?.isDebuff ?? true;
  const pct = duration > 0 ? (remaining / duration) * 100 : 0;
  const remainingSec = Math.max(0, remaining).toFixed(1);
  const displayName = def ? t(def.name, { defaultValue: def.name }) : effectId;

  // Server sends pre-computed modValue (e.g. 25 for -25%, or 8 for 8 HP/tick)
  const description = def
    ? t(def.description, {
        value: serverModValue ?? 0,
        interval: def.tickInterval ?? 0,
        defaultValue: "",
      })
    : "";

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
          "relative flex h-9 w-9 items-center justify-center overflow-hidden rounded border shadow-md shadow-black/30",
          isDebuff ? "border-red-500/50 bg-red-950/60" : "border-emerald-500/50 bg-emerald-950/60",
        ].join(" ")}
      >
        <ItemIcon iconId={def?.icon ?? effectId} fill />
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
