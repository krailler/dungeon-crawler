import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ItemIcon } from "./ItemIcon";
import { getRarityStyle } from "../utils/rarityColors";
import { STAT_I18N, formatStatValue, formatStatDiff } from "../utils/statLabels";

/** Stats where lower is better (for diff arrows) */
const LOWER_IS_BETTER = new Set(["attackCooldown"]);

export interface ItemSlotDef {
  icon: string;
  name: string;
  rarity?: string;
  equipSlot?: string;
}

export interface ItemSlotInstance {
  rolledStats: Record<string, number>;
  itemLevel: number;
}

export interface ItemSlotViewProps {
  /** Item definition (resolved). Null = empty slot. */
  def?: ItemSlotDef | null;
  /** Item instance with rolled stats (for equipment). */
  instance?: ItemSlotInstance | null;
  /** Instance of the currently equipped item in the same slot (for Shift comparison). */
  compareInstance?: ItemSlotInstance | null;
  /** Stack quantity. Only shown if > 1 (or > quantityMin). */
  quantity?: number;
  /** Minimum quantity to show the badge. Default 2. */
  quantityMin?: number;
  /** Label shown on empty slots (e.g. "Weapon", "Boots"). */
  emptyLabel?: string;
  /** Whether this slot is visually highlighted (drag target). */
  highlighted?: boolean;
  /** Whether this slot is the drag source (dimmed). */
  dimmed?: boolean;
  /** Whether to show a dashed border (empty/placeholder). */
  dashed?: boolean;
  /** Extra className on the outer container. */
  className?: string;
  /** Whether to show tooltip on hover. Default true. */
  showTooltip?: boolean;
  /** Extra content appended inside the tooltip. */
  tooltipExtra?: ReactNode;
  /** Interaction handlers — all optional, visual component only. */
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDragLeave?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  /** data-* attributes */
  dataDropZone?: string;
}

function DiffArrow({ stat, diff }: { stat: string; diff: number }): ReactNode {
  if (Math.abs(diff) < 0.001) return null;
  const inverted = LOWER_IS_BETTER.has(stat);
  const isGood = inverted ? diff < 0 : diff > 0;
  const color = isGood ? "text-emerald-400" : "text-red-400";
  const arrow = isGood ? "▲" : "▼";
  return (
    <span className={`ml-1 text-[9px] ${color}`}>
      {arrow} {formatStatDiff(stat, diff)}
    </span>
  );
}

/**
 * Pure visual item slot component. Renders the slot box with rarity border,
 * item icon, quantity badge, and optional hover tooltip with stats.
 * Supports Shift-held comparison against an equipped item.
 * No store dependencies — all data is passed as props.
 */
export const ItemSlotView = ({
  def,
  instance,
  compareInstance: compareInstanceProp,
  quantity,
  quantityMin = 2,
  emptyLabel,
  highlighted = false,
  dimmed = false,
  dashed = false,
  className = "",
  showTooltip = true,
  tooltipExtra,
  onClick,
  onContextMenu,
  draggable,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  dataDropZone,
}: ItemSlotViewProps): ReactNode => {
  const { t } = useTranslation();
  const hasItem = !!def;
  const rarityStyle = def ? getRarityStyle(def.rarity) : null;

  // Shift-held state for comparison
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    if (!compareInstanceProp) return;
    const onDown = (e: KeyboardEvent): void => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const onUp = (e: KeyboardEvent): void => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      setShiftHeld(false);
    };
  }, [compareInstanceProp]);

  const compareInstance = shiftHeld ? compareInstanceProp : null;

  // Build border + bg classes
  let borderClasses: string;
  if (highlighted) {
    borderClasses = "border-amber-400/60 bg-amber-500/15";
  } else if (dimmed) {
    borderClasses = rarityStyle?.border
      ? `${rarityStyle.border} bg-slate-800/60 opacity-40`
      : "border-slate-600/30 bg-slate-800/40 opacity-40";
  } else if (hasItem && rarityStyle?.border) {
    borderClasses = `${rarityStyle.border} bg-slate-800/60 hover:bg-slate-700/60`;
  } else if (hasItem) {
    borderClasses = "border-slate-600/30 bg-slate-800/40 hover:bg-slate-700/60";
  } else if (dashed) {
    borderClasses = "border-dashed border-slate-700/25 bg-slate-800/20 hover:border-slate-600/40";
  } else {
    borderClasses = "border-slate-700/25 bg-slate-800/20 hover:border-slate-600/40";
  }

  // Collect all stat keys from both items for comparison
  const allStats =
    compareInstance && instance
      ? new Set([...Object.keys(instance.rolledStats), ...Object.keys(compareInstance.rolledStats)])
      : null;

  return (
    <div
      className={`group relative flex h-[52px] w-[52px] flex-col items-center justify-center rounded-lg border transition-colors ${
        draggable ? "cursor-grab active:cursor-grabbing" : hasItem ? "cursor-pointer" : ""
      } ${borderClasses} ${className}`}
      onClick={onClick}
      onContextMenu={onContextMenu}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-drop-zone={dataDropZone}
    >
      {/* Icon */}
      {def ? (
        <ItemIcon iconId={def.icon} fill />
      ) : emptyLabel ? (
        <span className="text-[9px] text-slate-600">{emptyLabel}</span>
      ) : null}

      {/* Quantity badge */}
      {quantity != null && quantity >= quantityMin && (
        <span className="absolute bottom-1 right-1.5 rounded bg-slate-900/70 px-1 text-[10px] font-bold text-slate-200">
          {quantity}
        </span>
      )}

      {/* Hover tooltip */}
      {showTooltip && hasItem && (
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="w-max max-w-[220px] rounded-lg border border-slate-600/40 bg-slate-900/95 px-3 py-2 text-center shadow-xl backdrop-blur-sm">
            <div className={`text-[11px] font-semibold ${rarityStyle?.text ?? "text-slate-200"}`}>
              {t(def!.name)}
            </div>
            {instance && (
              <div className="mt-1 flex flex-col gap-0.5">
                {Object.entries(instance.rolledStats).map(([stat, value]) => {
                  const diff = compareInstance
                    ? value - (compareInstance.rolledStats[stat] ?? 0)
                    : 0;
                  return (
                    <div key={stat} className="text-[9px] text-emerald-400">
                      {formatStatValue(stat, value)} {t(STAT_I18N[stat] ?? stat)}
                      {compareInstance && <DiffArrow stat={stat} diff={diff} />}
                    </div>
                  );
                })}
                <div className="text-[9px] text-slate-500">
                  {t("equipment.itemLevel", { level: instance.itemLevel })}
                </div>
              </div>
            )}
            {/* Stats the equipped item has but this item doesn't — shown as losses */}
            {compareInstance && allStats && (
              <div className="flex flex-col gap-0.5">
                {[...allStats]
                  .filter(
                    (stat) =>
                      !(stat in instance!.rolledStats) && stat in compareInstance.rolledStats,
                  )
                  .map((stat) => {
                    const equippedVal = compareInstance.rolledStats[stat];
                    return (
                      <div key={stat} className="text-[9px] text-slate-500">
                        — {t(STAT_I18N[stat] ?? stat)}
                        <DiffArrow stat={stat} diff={-equippedVal} />
                      </div>
                    );
                  })}
              </div>
            )}
            {compareInstance && (
              <div className="mt-1 text-[9px] text-slate-500 italic">
                {t("equipment.comparing")}
              </div>
            )}
            {!compareInstance && compareInstanceProp && (
              <div className="mt-1 text-[9px] text-slate-500">{t("equipment.shiftToCompare")}</div>
            )}
            {tooltipExtra}
          </div>
        </div>
      )}
    </div>
  );
};
