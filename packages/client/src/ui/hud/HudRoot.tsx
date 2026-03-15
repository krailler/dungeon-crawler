import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { PartyMember } from "../stores/hudStore";
import { hudStore } from "../stores/hudStore";
import { authStore } from "../stores/authStore";
import { DebugPanel } from "./DebugPanel";
import { MinimapOverlay } from "./MinimapOverlay";
import { PauseMenu } from "./PauseMenu";
import { CharacterPanel } from "./CharacterPanel";

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
  const { t } = useTranslation();
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
        !member.online && "opacity-40",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-100">{member.name}</span>
            <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
              {t("character.level", { level: member.level })}
            </span>
          </div>
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
            {member.isLeader ? t("party.roleLeader") : t("party.roleMember")}
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

/** Character sheet toggle button (bottom-right) */
const CharacterButton = ({
  isOpen,
  onClick,
}: {
  isOpen: boolean;
  onClick: () => void;
}): JSX.Element => {
  const { t } = useTranslation();
  return (
    <button
      onClick={onClick}
      className={[
        "pointer-events-auto flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium shadow-lg shadow-black/30",
        "backdrop-blur-md transition-all",
        isOpen
          ? "border-sky-400/50 bg-sky-900/40 text-sky-300"
          : "border-slate-500/30 bg-slate-900/60 text-slate-300 hover:border-slate-400/40 hover:text-slate-200",
      ].join(" ")}
    >
      {/* Simple person icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
          clipRule="evenodd"
        />
      </svg>
      <span className="uppercase tracking-wider">{t("character.title")}</span>
      <kbd className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
        C
      </kbd>
    </button>
  );
};

export const HudRoot = (): JSX.Element => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const authSnapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const members = useMemo(() => snapshot.members, [snapshot.members]);
  const isAdmin = authSnapshot.role === "admin";
  const [characterOpen, setCharacterOpen] = useState(false);
  const toggleCharacter = useCallback(() => setCharacterOpen((v) => !v), []);
  const closeCharacter = useCallback(() => setCharacterOpen(false), []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "c" || e.key === "C") {
        // Don't toggle if user is typing in an input
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setCharacterOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 text-slate-100">
      {isAdmin && <DebugPanel />}
      <PauseMenu />
      <MinimapOverlay />
      {characterOpen && <CharacterPanel onClose={closeCharacter} />}
      <div className="pointer-events-auto absolute left-5 top-1/2 w-60 -translate-y-1/2">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-sky-400/20 ring-1 ring-sky-400/40">
            <div className="h-full w-full animate-glow-pulse rounded-full bg-sky-400/40" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-slate-400">
              {t("party.title")}
            </div>
            <div className="text-sm font-semibold text-slate-100">{t("party.subtitle")}</div>
          </div>
        </div>
        <div className="flex flex-col gap-3">
          {snapshot.connectionStatus === "connecting" && (
            <div className="rounded-2xl border border-dashed border-sky-400/30 bg-slate-900/30 px-3 py-3 text-xs text-sky-300">
              <span className="animate-pulse">{t("connection.connecting")}</span>
            </div>
          )}
          {snapshot.connectionStatus === "error" && (
            <div className="rounded-2xl border border-dashed border-red-400/40 bg-red-950/30 px-3 py-3 text-xs text-red-300">
              {snapshot.connectionInfo || t("connection.failed")}
            </div>
          )}
          {snapshot.connectionStatus === "connected" && members.length === 0 && (
            <div className="rounded-2xl border border-dashed border-slate-500/40 bg-slate-900/30 px-3 py-3 text-xs text-slate-400">
              {t("party.waiting")}
            </div>
          )}
          {snapshot.connectionStatus === "connected" && snapshot.connectionInfo && (
            <div className="rounded-2xl border border-slate-500/20 bg-slate-900/20 px-3 py-1.5 text-[10px] text-slate-500">
              {snapshot.connectionInfo}
            </div>
          )}
          {members.map((member) => (
            <PartyRow key={member.id} member={member} />
          ))}
        </div>
      </div>
      <div className="pointer-events-auto absolute right-5 top-4 flex items-center gap-2">
        <div className="rounded-full border border-slate-500/30 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300 backdrop-blur">
          {snapshot.ping > 0 ? t("hud.ping", { value: snapshot.ping }) : t("hud.pingEmpty")}
        </div>
        <div className="rounded-full border border-slate-500/30 bg-slate-900/60 px-3 py-1 text-[11px] text-slate-300 backdrop-blur">
          {snapshot.fps > 0 ? t("hud.fps", { value: snapshot.fps }) : t("hud.fpsEmpty")}
        </div>
      </div>
      {/* Character panel toggle — bottom right */}
      <div className="absolute bottom-5 right-5">
        <CharacterButton isOpen={characterOpen} onClick={toggleCharacter} />
      </div>
    </div>
  );
};
