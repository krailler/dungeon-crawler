import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import type { PartyMember } from "../stores/hudStore";
import { hudStore } from "../stores/hudStore";
import { authStore } from "../stores/authStore";
import { debugStore } from "../stores/debugStore";
import { minimapStore } from "../stores/minimapStore";
import { DebugPanel } from "./DebugPanel";
import { MinimapOverlay } from "./MinimapOverlay";
import { PauseMenu } from "./PauseMenu";
import { CharacterPanel } from "./CharacterPanel";
import { ChatPanel } from "./ChatPanel";
import { GateHint } from "./GatePrompt";
import { PromptOverlay } from "./PromptOverlay";
import { AnnouncementOverlay } from "./AnnouncementOverlay";
import { HudButton } from "../components/HudButton";
import { HudPill } from "../components/HudPill";
import { CharacterIcon } from "../icons/CharacterIcon";
import { MapIcon } from "../icons/MapIcon";
import { StarIcon } from "../icons/StarIcon";
import { CoinIcon } from "../icons/CoinIcon";

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

const PartyRow = ({
  member,
  onContextMenu,
}: {
  member: PartyMember;
  onContextMenu: (e: React.MouseEvent, member: PartyMember) => void;
}): JSX.Element => {
  const { t } = useTranslation();
  const safeMax = Math.max(1, member.maxHealth);
  const pct = Math.max(0, Math.min(100, (member.health / safeMax) * 100));
  const isDead = member.health <= 0;
  const barClass = isDead ? "from-red-900/60 via-red-900/40 to-red-950/50" : healthColor(pct);

  return (
    <div
      onContextMenu={(e) => onContextMenu(e, member)}
      className={[
        "animate-rise-in rounded-2xl border px-3 py-2 shadow-lg shadow-black/30",
        "backdrop-blur-md transition-all",
        "bg-[color:var(--ui-panel)] border-[color:var(--ui-panel-border)]",
        member.isLocal ? "ring-1 ring-sky-400/60" : "ring-1 ring-white/10",
        !member.online && "opacity-40",
        isDead && "saturate-[0.3]",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span
              className={`text-sm font-semibold ${isDead ? "text-slate-400 line-through" : "text-slate-100"}`}
            >
              {member.name}
            </span>
            <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-sky-400">
              {t("character.level", { level: member.level })}
            </span>
            {isDead && (
              <span className="rounded bg-red-900/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-400">
                {t("party.dead")}
              </span>
            )}
            {!member.online && (
              <span className="rounded bg-slate-700/50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {t("party.offline")}
              </span>
            )}
          </div>
          <span className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
            {member.isLeader ? t("party.roleLeader") : t("party.roleMember")}
          </span>
        </div>
        <span className={`font-mono text-[11px] ${isDead ? "text-red-400/70" : "text-slate-300"}`}>
          {formatHealth(member)}
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-900/80">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-[width] duration-300`}
          style={{ width: isDead ? "100%" : `${pct}%` }}
        />
      </div>
    </div>
  );
};

/** Context menu state */
type ContextMenuState = {
  x: number;
  y: number;
  member: PartyMember;
} | null;

export const HudRoot = (): JSX.Element => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const authSnapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const members = useMemo(() => snapshot.members, [snapshot.members]);
  const minimapSnapshot = useSyncExternalStore(minimapStore.subscribe, minimapStore.getSnapshot);
  const minimapVisible = minimapSnapshot.visible;
  const toggleMinimap = useCallback(() => minimapStore.toggle(), []);
  const debugSnapshot = useSyncExternalStore(debugStore.subscribe, debugStore.getSnapshot);
  const isAdmin = authSnapshot.role === "admin";
  const [characterOpen, setCharacterOpen] = useState(false);
  const toggleCharacter = useCallback(() => setCharacterOpen((v) => !v), []);
  const closeCharacter = useCallback(() => setCharacterOpen(false), []);

  // Context menu for party members
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const localMember = useMemo(() => members.find((m) => m.isLocal), [members]);

  const handlePartyContextMenu = useCallback((e: React.MouseEvent, member: PartyMember) => {
    e.preventDefault();
    // Don't show context menu on yourself
    if (member.isLocal) return;
    setCtxMenu({ x: e.clientX, y: e.clientY, member });
  }, []);

  const closeCtxMenu = useCallback(() => setCtxMenu(null), []);

  // Close context menu on click outside or Escape
  useEffect(() => {
    if (!ctxMenu) return;
    const handlePointer = (e: PointerEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setCtxMenu(null);
      }
    };
    // Defer so the opening right-click doesn't immediately close the menu
    const frame = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handlePointer, true);
      document.addEventListener("keydown", handleKey, true);
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointer, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [ctxMenu]);

  return (
    <div className="pointer-events-none absolute inset-0 text-slate-100">
      {isAdmin && <DebugPanel />}
      <PauseMenu />
      <GateHint />
      <PromptOverlay />
      <AnnouncementOverlay />
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
            <PartyRow key={member.id} member={member} onContextMenu={handlePartyContextMenu} />
          ))}
        </div>
      </div>

      {/* Party context menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="pointer-events-auto fixed z-[100] min-w-[160px] rounded-lg border border-slate-600/50 bg-slate-900/95 py-1 shadow-xl shadow-black/40 backdrop-blur"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <div className="border-b border-slate-700/50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {ctxMenu.member.name}
          </div>
          <button
            onClick={() => {
              hudStore.promoteLeader(ctxMenu.member.id);
              closeCtxMenu();
            }}
            disabled={!localMember?.isLeader}
            className={[
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
              localMember?.isLeader
                ? "text-slate-200 hover:bg-slate-700/50"
                : "cursor-default text-slate-200 opacity-40",
            ].join(" ")}
          >
            <StarIcon className="h-3.5 w-3.5 text-amber-400" />
            {t("party.promoteLeader")}
          </button>
          <button
            onClick={() => {
              hudStore.kickPlayer(ctxMenu.member.id);
              closeCtxMenu();
            }}
            disabled={!localMember?.isLeader}
            className={[
              "flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors",
              localMember?.isLeader
                ? "text-red-300 hover:bg-red-900/30"
                : "cursor-default text-red-300 opacity-40",
            ].join(" ")}
          >
            <svg
              className="h-3.5 w-3.5 text-red-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
            {t("party.kick")}
          </button>
        </div>
      )}
      <div className="pointer-events-auto absolute right-5 top-4 flex items-center gap-2">
        {localMember && (
          <HudPill variant="amber">
            <CoinIcon className="mr-1 inline h-3.5 w-3.5" />
            {localMember.gold.toLocaleString()}
          </HudPill>
        )}
        {debugSnapshot.showCoords && snapshot.localCoords && (
          <HudPill variant="amber" mono>
            X: {snapshot.localCoords.x.toFixed(1)} Z: {snapshot.localCoords.z.toFixed(1)}
          </HudPill>
        )}
        <HudPill>
          {snapshot.ping > 0 ? t("hud.ping", { value: snapshot.ping }) : t("hud.pingEmpty")}
        </HudPill>
        <HudPill>
          {snapshot.fps > 0 ? t("hud.fps", { value: snapshot.fps }) : t("hud.fpsEmpty")}
        </HudPill>
      </div>
      {/* Chat panel — bottom left */}
      <ChatPanel />
      {/* HUD buttons — bottom right */}
      <div className="absolute bottom-5 right-5 flex items-center gap-2">
        <HudButton
          onClick={toggleMinimap}
          isOpen={minimapVisible}
          icon={<MapIcon />}
          label={t("hud.map")}
          shortcut="M"
        />
        <HudButton
          onClick={toggleCharacter}
          isOpen={characterOpen}
          icon={<CharacterIcon />}
          label={t("character.title")}
          shortcut="C"
        />
      </div>
    </div>
  );
};
