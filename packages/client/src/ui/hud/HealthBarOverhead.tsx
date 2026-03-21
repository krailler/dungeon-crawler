import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { hudStore } from "../stores/hudStore";
import { healthColor } from "../utils/healthColor";

type FloatEntry = { id: number; amount: number };
let floatIdCounter = 0;

/**
 * Thin health bar displayed above the local player's character.
 * Shows floating damage/heal numbers. Hidden when health is full.
 */
export const HealthBarOverhead = (): ReactNode => {
  const snap = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = useMemo(() => snap.members.find((m) => m.isLocal), [snap.members]);

  const [hpFloats, setHpFloats] = useState<FloatEntry[]>([]);
  const prevHpRef = useRef<number | null>(null);

  const health = local?.health ?? 0;
  const maxHealth = local?.maxHealth ?? 1;

  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = health;
    if (prev === null) return;
    const delta = Math.round(health - prev);
    if (delta === 0) return;

    const id = ++floatIdCounter;
    setHpFloats((f) => [...f, { id, amount: delta }]);
    const timer = setTimeout(() => {
      setHpFloats((f) => f.filter((e) => e.id !== id));
    }, 1200);
    return () => clearTimeout(timer);
  }, [health]);

  if (!local) return null;

  const pct = Math.min(100, Math.max(0, (health / maxHealth) * 100));
  const hidden = health >= maxHealth && hpFloats.length === 0;

  return (
    <div className={`relative w-[120px] ${hidden ? "invisible" : ""}`}>
      <div className="h-[6px] w-full overflow-hidden rounded-full border border-slate-700/60 bg-slate-950/70 shadow-inner">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${healthColor(pct)} transition-[width] duration-200 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {hpFloats.map((f) => (
        <span
          key={f.id}
          className={`animate-xp-float absolute -top-1 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-xs font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${
            f.amount < 0 ? "text-red-400" : "text-emerald-400"
          }`}
        >
          {f.amount < 0 ? f.amount : `+${f.amount}`}
        </span>
      ))}
    </div>
  );
};
