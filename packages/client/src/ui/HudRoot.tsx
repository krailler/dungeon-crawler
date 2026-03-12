import { useMemo, useSyncExternalStore } from "react";
import type { PartyMember } from "./hudStore";
import { hudStore } from "./hudStore";

const healthColor = (pct: number): string => {
  if (pct > 60) return "from-emerald-400/90 via-emerald-400/60 to-emerald-500/80";
  if (pct > 30) return "from-amber-400/90 via-amber-400/70 to-amber-500/80";
  return "from-orange-400/90 via-orange-400/70 to-orange-500/80";
};

const formatHealth = (member: PartyMember): string => {
  const current = Math.max(0, Math.ceil(member.health));
  const max = Math.max(1, Math.ceil(member.maxHealth));
  return `${current}/${max}`;
};

const PartyRow = ({ member }: { member: PartyMember }): JSX.Element => {
  const safeMax = Math.max(1, member.maxHealth);
  const pct = Math.max(0, Math.min(100, (member.health / safeMax) * 100));
  const barClass = healthColor(pct);

  return (
    <div
      className={[
        "animate-rise-in rounded-2xl border px-3 py-2 shadow-lg shadow-black/30",
        "backdrop-blur-md transition-all",
        "bg-[color:var(--ui-panel)] border-[color:var(--ui-panel-border)]",
        member.isLocal ? "ring-1 ring-sky-400/60" : "ring-1 ring-white/10",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-slate-100">{member.name}</span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
            {member.isLocal ? "Leader" : "Member"}
          </span>
        </div>
        <span className="font-mono text-[11px] text-slate-300">{formatHealth(member)}</span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-900/80">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-[width] duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const HudRoot = (): JSX.Element => {
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const members = useMemo(() => snapshot.members, [snapshot.members]);

  return (
    <div className="pointer-events-none absolute inset-0 text-slate-100">
      <div className="absolute left-5 top-1/2 w-60 -translate-y-1/2">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-sky-400/20 ring-1 ring-sky-400/40">
            <div className="h-full w-full animate-glow-pulse rounded-full bg-sky-400/40" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-slate-400">Party</div>
            <div className="text-sm font-semibold text-slate-100">Expedition</div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {members.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-500/40 bg-slate-900/30 px-3 py-3 text-xs text-slate-400">
              Waiting for adventurers...
            </div>
          )}
          {members.map((member) => (
            <PartyRow key={member.id} member={member} />
          ))}
        </div>
      </div>
      <div className="absolute right-5 top-4 rounded-full border border-slate-500/30 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300 backdrop-blur">
        {snapshot.fps > 0 ? `${snapshot.fps} FPS` : "-- FPS"}
      </div>
    </div>
  );
};
