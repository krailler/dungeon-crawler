import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { targetStore } from "../stores/targetStore";
import { hudStore } from "../stores/hudStore";
import { creatureStore } from "../stores/creatureStore";
import { deathStore } from "../stores/deathStore";
import { healthColor } from "../components/healthColor";
import { isEntityDead } from "../components/lifeState";
import { settingsStore, displayKeyName } from "../stores/settingsStore";
import { LifeState } from "@dungeon/shared";

export const TargetFrame = (): ReactNode => {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(targetStore.subscribe, targetStore.getSnapshot);
  const deathSnap = useSyncExternalStore(deathStore.subscribe, deathStore.getSnapshot);
  const hudSnap = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const creatureSnap = useSyncExternalStore(creatureStore.subscribe, creatureStore.getSnapshot);

  // Resolve target entity data from the appropriate store.
  const targetCreature =
    snap.targetType === "creature" && snap.targetId ? creatureSnap.get(snap.targetId) : undefined;
  const targetMember =
    snap.targetType === "player" && snap.targetId
      ? hudSnap.members.find((m) => m.id === snap.targetId)
      : undefined;

  const entity = useMemo(() => {
    if (targetMember) {
      return {
        name: targetMember.name,
        health: targetMember.health,
        maxHealth: targetMember.maxHealth,
        level: targetMember.level,
        isDead: isEntityDead(targetMember.lifeState, targetMember.health),
        reviveProgress: targetMember.reviveProgress ?? 0,
      };
    }
    if (targetCreature) {
      return {
        name: targetCreature.name,
        health: targetCreature.health,
        maxHealth: targetCreature.maxHealth,
        level: targetCreature.level,
        isDead: targetCreature.isDead,
        reviveProgress: 0,
      };
    }
    return null;
  }, [targetMember, targetCreature]);

  // Compute canRevive before hooks (entity may be null — that's fine, just false)
  const canRevive =
    snap.targetType === "player" &&
    entity !== null &&
    entity.isDead &&
    deathSnap.lifeState === LifeState.ALIVE;

  const handleRevive = useCallback(() => {
    if (snap.targetId && snap.inReviveRange && canRevive) {
      deathStore.startRevive(snap.targetId);
    }
  }, [snap.targetId, snap.inReviveRange, canRevive]);

  // Listen for the revive keybinding
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === settingsStore.getBinding("revive")) {
        handleRevive();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleRevive]);

  if (!snap.targetId || !entity) return null;

  const safeMax = Math.max(1, entity.maxHealth);
  const pct = Math.max(0, Math.min(100, (entity.health / safeMax) * 100));

  return (
    <div className="pointer-events-none absolute left-1/2 top-12 -translate-x-1/2">
      <div className="animate-rise-in">
        <div
          className={[
            "flex min-w-[200px] items-center gap-3 rounded-2xl border px-4 py-2.5",
            "bg-[color:var(--ui-panel)] shadow-lg shadow-black/30 backdrop-blur-md",
            entity.isDead
              ? "border-red-500/30 saturate-[0.3]"
              : "border-[color:var(--ui-panel-border)]",
          ].join(" ")}
        >
          <div className="flex flex-1 flex-col gap-1">
            <div className="flex items-center gap-2">
              <span
                className={`text-sm font-semibold ${entity.isDead ? "text-slate-400 line-through" : "text-slate-100"}`}
              >
                {entity.name}
              </span>
              <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
                {t("character.level", { level: entity.level })}
              </span>
              {entity.isDead && (
                <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                  {t("party.dead")}
                </span>
              )}
            </div>
            <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-900/80">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${entity.isDead ? "from-red-900/60 via-red-900/40 to-red-950/50" : healthColor(pct)} transition-[width] duration-300`}
                style={{ width: entity.isDead ? "100%" : `${pct}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">
                {entity.health} / {entity.maxHealth}
              </span>
            </div>
            {canRevive && entity.reviveProgress > 0 && (
              <div className="mt-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                  {t("death.reviving")}
                </span>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800/80 ring-1 ring-emerald-500/30">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-[width] duration-200"
                    style={{ width: `${Math.min(100, entity.reviveProgress * 100)}%` }}
                  />
                </div>
              </div>
            )}
            {canRevive && entity.reviveProgress <= 0 && (
              <div className="group relative mt-1">
                <button
                  onClick={handleRevive}
                  disabled={!snap.inReviveRange}
                  className={[
                    "pointer-events-auto w-full rounded border px-2 py-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
                    snap.inReviveRange
                      ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-400 hover:border-emerald-400/60 hover:bg-emerald-800/40 hover:text-emerald-300"
                      : "cursor-not-allowed border-slate-600/30 bg-slate-800/30 text-slate-500",
                  ].join(" ")}
                >
                  {t("death.revive")}{" "}
                  <kbd className="ml-1 rounded border border-current/30 px-1 py-0.5 text-[9px] font-mono opacity-70">
                    {displayKeyName(settingsStore.getBinding("revive"))}
                  </kbd>
                </button>
                {!snap.inReviveRange && (
                  <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-900/95 px-2 py-0.5 text-[10px] text-slate-400 opacity-0 shadow-lg ring-1 ring-slate-700/50 transition-opacity group-hover:opacity-100">
                    {t("death.outOfRange")}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
