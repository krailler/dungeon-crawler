import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "./hudStore";
import type { CharacterStats } from "./hudStore";

const StatRow = ({ label, value, color }: { label: string; value: number; color: string }) => (
  <div className="flex items-center justify-between py-1">
    <span className="text-xs text-slate-400">{label}</span>
    <span className={`font-mono text-sm font-semibold ${color}`}>{value}</span>
  </div>
);

export const CharacterPanel = ({ onClose }: { onClose: () => void }): JSX.Element | null => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = snapshot.members.find((m) => m.isLocal);

  if (!local?.stats) return null;

  const stats: CharacterStats = local.stats;
  const healthPct = Math.round((local.health / Math.max(1, local.maxHealth)) * 100);

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
            onClick={onClose}
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

        {/* Divider + Base stats */}
        <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-slate-500">
          {t("character.baseStats")}
        </div>
        <div className="mb-3 rounded-xl bg-slate-900/40 px-3 py-1">
          <StatRow label={t("character.strength")} value={stats.strength} color="text-red-400" />
          <StatRow label={t("character.vitality")} value={stats.vitality} color="text-green-400" />
          <StatRow label={t("character.agility")} value={stats.agility} color="text-yellow-400" />
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
