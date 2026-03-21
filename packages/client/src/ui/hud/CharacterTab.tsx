import { useCallback, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AllocatableStat, STAT_RESET_GOLD_PER_LEVEL, TutorialStep } from "@dungeon/shared";
import type { AllocatableStatValue } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import type { CharacterStats } from "../stores/hudStore";
import { tutorialStore } from "../stores/tutorialStore";
import { CoinIcon } from "../icons/CoinIcon";
import { Tooltip } from "../components/Tooltip";
import { ProgressBar } from "../components/ProgressBar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { EquipmentTab } from "./EquipmentTab";
import { playUiSfx } from "../../audio/uiSfx";

const StatRow = ({
  label,
  value,
  color,
  tooltip,
  canAllocate,
  onAllocate,
}: {
  label: string;
  value: number;
  color: string;
  tooltip?: string;
  canAllocate?: boolean;
  onAllocate?: () => void;
}) => {
  const row = (
    <div className="flex items-center justify-between py-1">
      <span className="text-xs text-slate-400">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
        {canAllocate && (
          <button
            onClick={onAllocate}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-xs font-bold text-sky-300 transition-colors hover:bg-sky-500/40 hover:text-sky-100"
          >
            +
          </button>
        )}
      </div>
    </div>
  );

  if (tooltip) {
    return (
      <Tooltip content={tooltip} position="bottom" className="bg-slate-950/95 shadow-black/40">
        {row}
      </Tooltip>
    );
  }

  return row;
};

export const CharacterTab = (): ReactNode => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = snapshot.members.find((m) => m.isLocal);

  if (!local?.stats) return null;

  const stats: CharacterStats = local.stats;
  const statPoints = local.statPoints ?? 0;

  const playerLevel = local.level ?? 1;
  const spent = stats.strength - 10 + (stats.vitality - 10) + (stats.agility - 10);
  const resetCost = playerLevel * STAT_RESET_GOLD_PER_LEVEL;
  const canReset = spent > 0 && (local.gold ?? 0) >= resetCost;
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleAllocate = (stat: AllocatableStatValue): void => {
    playUiSfx("ui_click");
    tutorialStore.dismiss(TutorialStep.ALLOCATE_STATS);
    hudStore.allocateStat(stat);
  };

  const handleResetConfirm = useCallback(() => {
    hudStore.resetStats();
    setShowResetConfirm(false);
    playUiSfx("ui_click");
  }, []);

  return (
    <>
      <div className="flex gap-4">
        {/* Left column: stats */}
        <div className="flex-1 min-w-0">
          {/* Health bar */}
          <div className="mb-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[11px] text-slate-500">{t("character.health")}</span>
              <span className="font-mono text-[11px] text-slate-400">
                {Math.ceil(local.health)}/{local.maxHealth}
              </span>
            </div>
            <ProgressBar value={local.health} max={local.maxHealth} color="health" />
          </div>

          {/* XP bar */}
          {(local.xpToNext ?? 0) > 0 && (
            <div className="mb-4">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-[11px] text-slate-500">{t("character.xp")}</span>
                <span className="font-mono text-[11px] text-slate-400">
                  {(local.xp ?? 0).toLocaleString()}/{(local.xpToNext ?? 0).toLocaleString()}
                </span>
              </div>
              <ProgressBar value={local.xp ?? 0} max={local.xpToNext ?? 1} color="xp" />
            </div>
          )}

          {/* Gold */}
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-900/20 px-3 py-2">
            <CoinIcon className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">
              {(local.gold ?? 0).toLocaleString()} {t("character.gold")}
            </span>
          </div>

          {/* Divider + Base stats */}
          <div className="mb-2 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.2em] text-slate-500">
              {t("character.baseStats")}
            </span>
            {statPoints > 0 && (
              <span className="animate-pulse rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold text-sky-300">
                {t("character.statPoints", { count: statPoints })}
              </span>
            )}
          </div>
          <div className="mb-3 rounded-xl bg-slate-900/40 px-3 py-1">
            <StatRow
              label={t("character.strength")}
              value={stats.strength}
              color="text-red-400"
              tooltip={t("character.strengthTip")}
              canAllocate={statPoints > 0}
              onAllocate={() => handleAllocate(AllocatableStat.STRENGTH)}
            />
            <StatRow
              label={t("character.vitality")}
              value={stats.vitality}
              color="text-green-400"
              tooltip={t("character.vitalityTip")}
              canAllocate={statPoints > 0}
              onAllocate={() => handleAllocate(AllocatableStat.VITALITY)}
            />
            <StatRow
              label={t("character.agility")}
              value={stats.agility}
              color="text-yellow-400"
              tooltip={t("character.agilityTip")}
              canAllocate={statPoints > 0}
              onAllocate={() => handleAllocate(AllocatableStat.AGILITY)}
            />
          </div>

          {/* Derived stats */}
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
            {t("character.derivedStats")}
          </div>
          <div className="rounded-xl bg-slate-900/40 px-3 py-1">
            <StatRow
              label={t("character.attackDamage")}
              value={stats.attackDamage}
              color="text-orange-400"
              tooltip={t("character.attackDamageTip")}
            />
            <StatRow
              label={t("character.defense")}
              value={stats.defense}
              color="text-sky-400"
              tooltip={t("character.defenseTip")}
            />
            <StatRow
              label={t("character.speed")}
              value={parseFloat(stats.speed.toFixed(1))}
              color="text-emerald-400"
              tooltip={t("character.speedTip")}
            />
            <StatRow
              label={t("character.attackSpeed")}
              value={parseFloat(stats.attackCooldown.toFixed(2))}
              color="text-purple-400"
              tooltip={t("character.attackSpeedTip")}
            />
          </div>
        </div>
        {/* Right column: equipment */}
        <div className="w-[140px] shrink-0">
          <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
            {t("character.tabEquipment")}
          </div>
          <EquipmentTab compact />
        </div>
      </div>

      {/* Reset stats button */}
      {spent > 0 && (
        <div className="mt-3 border-t border-zinc-700/50 pt-3">
          <Tooltip
            content={!canReset ? t("character.resetNotEnoughGold", { cost: resetCost }) : ""}
          >
            <button
              onClick={() => {
                if (canReset) {
                  playUiSfx("ui_click");
                  setShowResetConfirm(true);
                }
              }}
              className={`w-full rounded-lg px-3 py-1.5 text-xs transition-colors ${
                canReset
                  ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                  : "cursor-not-allowed text-zinc-600"
              }`}
            >
              {t("character.reset", { cost: resetCost })}
            </button>
          </Tooltip>
        </div>
      )}

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <ConfirmDialog
          variant="inline"
          title={t("character.resetTitle")}
          message={t("character.resetMessage", { cost: resetCost })}
          confirmLabel={t("character.resetConfirm")}
          cancelLabel={t("character.resetCancel")}
          onConfirm={handleResetConfirm}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </>
  );
};
