import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { deathStore } from "../stores/deathStore";
import { LifeState } from "@dungeon/shared";

export const DeathOverlay = (): ReactNode => {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(deathStore.subscribe, deathStore.getSnapshot);

  if (snap.lifeState === LifeState.ALIVE) return null;

  const isDowned = snap.lifeState === LifeState.DOWNED;
  const timerValue = isDowned ? snap.bleedTimer : snap.respawnTimer;
  const timerDisplay = Math.max(0, timerValue).toFixed(1);

  return (
    <div
      className={[
        "pointer-events-auto absolute inset-0 z-[200] flex flex-col items-center justify-center transition-colors duration-500",
        isDowned ? "bg-red-950/40" : "bg-slate-950/60",
      ].join(" ")}
    >
      {/* Vignette overlay */}
      <div
        className={[
          "pointer-events-none absolute inset-0",
          isDowned
            ? "shadow-[inset_0_0_120px_40px_rgba(127,29,29,0.6)]"
            : "shadow-[inset_0_0_120px_40px_rgba(15,23,42,0.8)]",
        ].join(" ")}
      />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center gap-4">
        {/* Title */}
        <h1
          className={[
            "text-3xl font-bold tracking-wide drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]",
            isDowned ? "text-red-400" : "text-slate-300",
          ].join(" ")}
        >
          {isDowned ? t("death.downed") : t("death.dead")}
        </h1>

        {/* Subtitle */}
        {isDowned && <p className="text-sm text-red-300/70">{t("death.downedSub")}</p>}

        {/* Timer */}
        <div className="flex flex-col items-center gap-1">
          <span className="text-xs uppercase tracking-widest text-slate-400">
            {isDowned ? t("death.bleedOut") : t("death.respawning")}
          </span>
          <span
            className={[
              "font-mono text-4xl font-bold tabular-nums drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]",
              isDowned ? "text-red-400" : "text-slate-200",
            ].join(" ")}
          >
            {timerDisplay}s
          </span>
        </div>

        {/* Revive progress bar (only when downed and someone is channelling) */}
        {isDowned && snap.reviveProgress > 0 && (
          <div className="mt-2 flex flex-col items-center gap-1.5">
            <span className="text-xs text-emerald-400/80">{t("death.reviving")}</span>
            <div className="h-3 w-48 overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-emerald-500/30">
              <div
                className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-[width] duration-200"
                style={{ width: `${Math.min(100, snap.reviveProgress * 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
