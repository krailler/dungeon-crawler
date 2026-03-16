import { useSyncExternalStore } from "react";
import { hudStore } from "../stores/hudStore";
import { STAMINA_MAX } from "@dungeon/shared";

export const StaminaBar = (): JSX.Element | null => {
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = snapshot.members.find((m) => m.isLocal);

  const stamina = local?.stamina ?? STAMINA_MAX;

  // Hide bar when stamina is full (nothing to show)
  if (stamina >= STAMINA_MAX) return null;

  const pct = Math.min(100, Math.max(0, (stamina / STAMINA_MAX) * 100));

  return (
    <div className="pointer-events-none absolute bottom-[112px] left-1/2 w-[264px] -translate-x-1/2">
      <div className="h-[12px] w-full overflow-hidden rounded-full border border-emerald-900/40 bg-slate-950/70 shadow-inner">
        <div
          className="h-full rounded-full bg-gradient-to-r from-emerald-500/90 via-lime-400/80 to-emerald-500/90 shadow-[0_0_6px_rgba(52,211,153,0.4)] transition-[width] duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};
