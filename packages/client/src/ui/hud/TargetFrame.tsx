import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { targetStore } from "../stores/targetStore";
import { healthColor } from "../components/healthColor";

export const TargetFrame = (): ReactNode => {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(targetStore.subscribe, targetStore.getSnapshot);

  if (!snap.targetId) return null;

  const safeMax = Math.max(1, snap.maxHealth);
  const pct = Math.max(0, Math.min(100, (snap.health / safeMax) * 100));
  const isDead = snap.isDead || snap.health <= 0;

  return (
    <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2">
      <div className="animate-rise-in">
        <div
          className={[
            "flex min-w-[200px] items-center gap-3 rounded-2xl border px-4 py-2.5",
            "bg-[color:var(--ui-panel)] shadow-lg shadow-black/30 backdrop-blur-md",
            isDead ? "border-red-500/30 saturate-[0.3]" : "border-[color:var(--ui-panel-border)]",
          ].join(" ")}
        >
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-semibold ${isDead ? "text-slate-400 line-through" : "text-slate-100"}`}
              >
                {snap.name}
              </span>
              <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                {t("character.level", { level: snap.level })}
              </span>
              {isDead && (
                <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                  {t("party.dead")}
                </span>
              )}
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-900/80">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${isDead ? "from-red-900/60 via-red-900/40 to-red-950/50" : healthColor(pct)} transition-[width] duration-300`}
                style={{ width: isDead ? "100%" : `${pct}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                {snap.health} / {snap.maxHealth}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
