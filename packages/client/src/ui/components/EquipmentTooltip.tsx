import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ItemDefClient } from "@dungeon/shared";
import { itemInstanceStore } from "../stores/itemInstanceStore";
import { getRarityStyle } from "../utils/rarityColors";
import { STAT_I18N, formatStatValue } from "../utils/statLabels";

/** Stats where lower is better */
const LOWER_IS_BETTER = new Set(["attackCooldown"]);

function formatDiff(stat: string, diff: number): string {
  if (stat === "attackCooldown" || stat === "moveSpeed") {
    const sign = diff > 0 ? "+" : "";
    return `${sign}${diff.toFixed(2)}`;
  }
  const sign = diff > 0 ? "+" : "";
  return `${sign}${Math.round(diff)}`;
}

function DiffArrow({ stat, diff }: { stat: string; diff: number }): ReactNode {
  if (Math.abs(diff) < 0.001) return null;
  const inverted = LOWER_IS_BETTER.has(stat);
  const isGood = inverted ? diff < 0 : diff > 0;
  const color = isGood ? "text-emerald-400" : "text-red-400";
  const arrow = isGood ? "▲" : "▼";
  return (
    <span className={`ml-1 text-[9px] ${color}`}>
      {arrow} {formatDiff(stat, diff)}
    </span>
  );
}

/**
 * Renders an equipment tooltip showing item name, slot, level, and rolled stats.
 * When compareInstanceId is set, shows diff arrows comparing against equipped item.
 */
export function EquipmentTooltip({
  def,
  instanceId,
  hint,
  compareInstanceId,
}: {
  def: ItemDefClient;
  instanceId: string;
  hint?: string;
  /** Instance ID of the currently equipped item in the same slot (for comparison) */
  compareInstanceId?: string;
}): ReactNode {
  const { t } = useTranslation();
  const instances = useSyncExternalStore(
    itemInstanceStore.subscribe,
    itemInstanceStore.getSnapshot,
  );
  const instance = instances.get(instanceId);
  const compareInstance = compareInstanceId ? instances.get(compareInstanceId) : undefined;

  if (!instance) {
    return (
      <div className="flex flex-col gap-1">
        <div className={`text-xs font-bold ${getRarityStyle(def.rarity).text}`}>{t(def.name)}</div>
        <div className="text-[10px] text-slate-500">{t("equipment.loading", "Loading...")}</div>
      </div>
    );
  }

  const statEntries = Object.entries(instance.rolledStats);
  const slotKey = def.equipSlot ? `equipment.${def.equipSlot.replace(/_\d+$/, "")}` : "";

  // Collect all stat keys from both items for comparison
  const allStats = compareInstance
    ? new Set([...Object.keys(instance.rolledStats), ...Object.keys(compareInstance.rolledStats)])
    : null;

  return (
    <div className="flex flex-col gap-1">
      <div className={`text-xs font-bold ${getRarityStyle(def.rarity).text}`}>{t(def.name)}</div>
      <div className="text-[10px] text-slate-400">
        {slotKey && t(slotKey)} · {t("equipment.itemLevel", { level: instance.itemLevel })}
      </div>
      {def.levelReq > 1 && (
        <div className="text-[10px] text-amber-400">
          {t("equipment.levelReq", { level: def.levelReq })}
        </div>
      )}
      {statEntries.length > 0 && (
        <div className="mt-1 flex flex-col gap-0.5">
          {statEntries.map(([stat, value]) => {
            const diff = compareInstance ? value - (compareInstance.rolledStats[stat] ?? 0) : 0;
            return (
              <div key={stat} className="text-[10px] text-emerald-400">
                {formatStatValue(stat, value)} {t(STAT_I18N[stat] ?? stat)}
                {compareInstance && <DiffArrow stat={stat} diff={diff} />}
              </div>
            );
          })}
        </div>
      )}
      {/* Stats the equipped item has but this item doesn't — shown as losses */}
      {compareInstance && allStats && (
        <div className="flex flex-col gap-0.5">
          {[...allStats]
            .filter(
              (stat) => !(stat in instance.rolledStats) && stat in compareInstance.rolledStats,
            )
            .map((stat) => {
              const equippedVal = compareInstance.rolledStats[stat];
              return (
                <div key={stat} className="text-[10px] text-slate-500">
                  — {t(STAT_I18N[stat] ?? stat)}
                  <DiffArrow stat={stat} diff={-equippedVal} />
                </div>
              );
            })}
        </div>
      )}
      {compareInstance && (
        <div className="mt-1 text-[9px] text-slate-500 italic">{t("equipment.comparing")}</div>
      )}
      {hint && <div className="mt-1 text-[9px] text-slate-500">{hint}</div>}
    </div>
  );
}
