import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { AllocatableStat } from "@dungeon/shared";
import type { AllocatableStatValue } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import type { CharacterStats } from "../stores/hudStore";
import { tutorialStore } from "../stores/tutorialStore";
import { CoinIcon } from "../icons/CoinIcon";
import { playUiSfx } from "../../audio/uiSfx";

const StatRow = ({
  label,
  value,
  color,
  canAllocate,
  onAllocate,
}: {
  label: string;
  value: number;
  color: string;
  canAllocate?: boolean;
  onAllocate?: () => void;
}) => (
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

export const CharacterPanel = ({ onClose }: { onClose: () => void }): JSX.Element | null => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = snapshot.members.find((m) => m.isLocal);

  if (!local?.stats) return null;

  const stats: CharacterStats = local.stats;
  const statPoints = local.statPoints ?? 0;
  const healthPct = Math.round((local.health / Math.max(1, local.maxHealth)) * 100);

  const handleAllocate = (stat: AllocatableStatValue): void => {
    playUiSfx("ui_click");
    tutorialStore.dismiss();
    hudStore.allocateStat(stat);
  };

  return (
    <div className="pointer-events-auto absolute right-5 top-14 w-56 animate-rise-in">
      <div className="rounded-2xl border border-[color:var(--ui-panel-border)] bg-[color:var(--ui-panel)] p-4 shadow-xl shadow-black/40 backdrop-blur-md">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-100">{local.name}</h3>
            <span className="text-[11px] text-sky-400">
              {t("character.level", { level: local.level })}
            </span>
          </div>
          <button
            onClick={() => {
              playUiSfx("ui_click");
              onClose();
            }}
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-700/50 hover:text-slate-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Health bar */}
        <div className="mb-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[11px] text-slate-500">{t("character.health")}</span>
            <span className="font-mono text-[11px] text-slate-400">
              {Math.ceil(local.health)}/{local.maxHealth}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900/80">
            <div
              className="h-full rounded-full bg-gradient-to-r from-emerald-400/90 to-emerald-500/80 transition-[width] duration-300"
              style={{ width: `${healthPct}%` }}
            />
          </div>
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
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900/80">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-400/90 to-violet-500/80 transition-[width] duration-300"
                style={{
                  width: `${Math.round(((local.xp ?? 0) / Math.max(1, local.xpToNext ?? 1)) * 100)}%`,
                }}
              />
            </div>
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
            canAllocate={statPoints > 0}
            onAllocate={() => handleAllocate(AllocatableStat.STRENGTH)}
          />
          <StatRow
            label={t("character.vitality")}
            value={stats.vitality}
            color="text-green-400"
            canAllocate={statPoints > 0}
            onAllocate={() => handleAllocate(AllocatableStat.VITALITY)}
          />
          <StatRow
            label={t("character.agility")}
            value={stats.agility}
            color="text-yellow-400"
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
          />
          <StatRow label={t("character.defense")} value={stats.defense} color="text-sky-400" />
        </div>
      </div>
    </div>
  );
};
