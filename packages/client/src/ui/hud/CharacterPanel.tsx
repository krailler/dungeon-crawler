import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { AllocatableStat, TutorialStep } from "@dungeon/shared";
import type { AllocatableStatValue } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import type { CharacterStats } from "../stores/hudStore";
import { classDefStore } from "../stores/classDefStore";
import { tutorialStore } from "../stores/tutorialStore";
import { CoinIcon } from "../icons/CoinIcon";
import { HudPanel } from "../components/HudPanel";
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
}) => (
  <div className="group/stat relative flex items-center justify-between py-1">
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
    {tooltip && (
      <div className="pointer-events-none absolute left-0 top-full z-50 mt-1 hidden rounded-lg bg-slate-950/95 px-2.5 py-1.5 text-[11px] leading-tight text-slate-300 shadow-lg shadow-black/40 group-hover/stat:block">
        {tooltip}
      </div>
    )}
  </div>
);

export const CharacterPanel = ({ onClose }: { onClose: () => void }): ReactNode => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const classDefs = useSyncExternalStore(classDefStore.subscribe, classDefStore.getSnapshot);
  const local = snapshot.members.find((m) => m.isLocal);

  if (!local?.stats) return null;

  const stats: CharacterStats = local.stats;
  const statPoints = local.statPoints ?? 0;
  const healthPct = Math.round((local.health / Math.max(1, local.maxHealth)) * 100);
  const classDef = local.classId ? classDefs.get(local.classId) : undefined;

  const handleAllocate = (stat: AllocatableStatValue): void => {
    playUiSfx("ui_click");
    tutorialStore.dismiss(TutorialStep.ALLOCATE_STATS);
    hudStore.allocateStat(stat);
  };

  return (
    <HudPanel
      onClose={onClose}
      header={
        <div>
          <h3 className="text-sm font-bold text-slate-100">{local.name}</h3>
          <span className="text-[11px] text-sky-400">
            {t("character.level", { level: local.level })}
            {classDef && ` — ${t(classDef.name)}`}
          </span>
        </div>
      }
      panelId="character"
      defaultPosition={{ x: window.innerWidth - 244, y: 56 }}
      className="w-56"
    >
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
      </div>
    </HudPanel>
  );
};
