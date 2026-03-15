import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "../stores/hudStore";

type XpFloat = { id: number; amount: number };

let floatId = 0;

export const XpBar = (): JSX.Element | null => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = snapshot.members.find((m) => m.isLocal);

  const [floats, setFloats] = useState<XpFloat[]>([]);
  const prevXpRef = useRef<number | null>(null);

  // Detect XP changes and spawn floating text
  useEffect(() => {
    if (!local) return;
    const prevXp = prevXpRef.current;
    prevXpRef.current = local.xp;

    // Skip initial render (prevXp is null) and decreases
    if (prevXp === null || local.xp <= prevXp) return;

    const gain = local.xp - prevXp;
    const id = ++floatId;
    setFloats((prev) => [...prev, { id, amount: gain }]);

    // Auto-remove after animation completes (1.2s)
    const timer = setTimeout(() => {
      setFloats((prev) => prev.filter((f) => f.id !== id));
    }, 1200);
    return () => clearTimeout(timer);
  }, [local?.xp]);

  if (!local || local.xpToNext <= 0) return null;

  const pct = Math.min(
    100,
    Math.max(0, Math.round((local.xp / Math.max(1, local.xpToNext)) * 100)),
  );

  return (
    <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 w-[60%] max-w-[700px]">
      {/* Floating XP gain texts */}
      <div className="relative flex justify-center">
        {floats.map((f) => (
          <span
            key={f.id}
            className="animate-xp-float absolute bottom-2 font-mono text-sm font-bold text-purple-300 drop-shadow-[0_1px_3px_rgba(168,85,247,0.6)]"
          >
            +{f.amount} XP
          </span>
        ))}
      </div>

      {/* Bar container */}
      <div className="relative">
        {/* Level label — left */}
        <span className="absolute -top-4 left-0 text-[10px] font-semibold text-purple-300/80">
          {t("character.level", { level: local.level })}
        </span>

        {/* XP numbers — right */}
        <span className="absolute -top-4 right-0 font-mono text-[10px] text-slate-400/70">
          {local.xp.toLocaleString()} / {local.xpToNext.toLocaleString()}
        </span>

        {/* Bar background */}
        <div className="h-[6px] w-full overflow-hidden rounded-full border border-purple-900/40 bg-slate-950/70 shadow-inner">
          {/* Fill */}
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500/90 via-violet-400/80 to-purple-500/90 shadow-[0_0_6px_rgba(168,85,247,0.4)] transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
};
