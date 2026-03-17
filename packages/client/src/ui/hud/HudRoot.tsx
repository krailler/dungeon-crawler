import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { PartyMember } from "../stores/hudStore";
import { hudStore } from "../stores/hudStore";
import { authStore } from "../stores/authStore";
import { debugStore } from "../stores/debugStore";
import { adminStore } from "../stores/adminStore";
import { minimapStore } from "../stores/minimapStore";
import { DebugPanel } from "./DebugPanel";
import { MinimapOverlay } from "./MinimapOverlay";
import { PauseMenu } from "./PauseMenu";
import { CharacterPanel } from "./CharacterPanel";
import { ChatPanel } from "./ChatPanel";
import { GateHint } from "./GatePrompt";
import { PromptOverlay } from "./PromptOverlay";
import { AnnouncementOverlay } from "./AnnouncementOverlay";
import { TutorialHint } from "./TutorialHint";
import { XpBar } from "./XpBar";
import { SkillBar } from "./SkillBar";
import { ConsumableSlots } from "./ConsumableSlots";
import { InventoryPanel } from "./InventoryPanel";
import { StaminaBar } from "./StaminaBar";
import { ActionFeedback } from "./ActionFeedback";
import { LootBagPanel } from "./LootBagPanel";
import { HudButton } from "../components/HudButton";
import { HudPill } from "../components/HudPill";
import { playUiSfx } from "../../audio/uiSfx";
import { CharacterIcon } from "../icons/CharacterIcon";
import { MapIcon } from "../icons/MapIcon";
import { StarIcon } from "../icons/StarIcon";
import { BackpackIcon } from "../icons/BackpackIcon";
import { settingsStore, displayKeyName } from "../stores/settingsStore";

type FloatEntry = { id: number; amount: number };
let floatIdCounter = 0;

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
}): ReactNode => {
  const { t } = useTranslation();
  const safeMax = Math.max(1, member.maxHealth);
  const pct = Math.max(0, Math.min(100, (member.health / safeMax) * 100));
  const isDead = member.health <= 0;
  const isLowHp = !isDead && pct <= 30;
  const barClass = isDead ? "from-red-900/60 via-red-900/40 to-red-950/50" : healthColor(pct);

  // Floating health change numbers
  const [hpFloats, setHpFloats] = useState<FloatEntry[]>([]);
  const prevHpRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = member.health;
    if (prev === null) return;
    const delta = Math.round(member.health - prev);
    if (delta === 0) return;

    const id = ++floatIdCounter;
    setHpFloats((f) => [...f, { id, amount: delta }]);
    const timer = setTimeout(() => {
      setHpFloats((f) => f.filter((e) => e.id !== id));
    }, 1200);
    return () => clearTimeout(timer);
  }, [member.health]);

  return (
    <div onContextMenu={(e) => onContextMenu(e, member)} className="animate-rise-in">
      <div
        className={[
          "rounded-2xl border px-3 py-2 shadow-lg shadow-black/30",
          "backdrop-blur-md transition-[border-color,box-shadow] duration-500",
          "bg-[color:var(--ui-panel)]",
          isLowHp ? "animate-low-hp border-red-500/40" : "border-[color:var(--ui-panel-border)]",
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
          <div className="relative">
            {hpFloats.map((f) => (
              <span
                key={f.id}
                className={`animate-xp-float absolute -top-1 right-0 whitespace-nowrap font-mono text-xs font-bold drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)] ${
                  f.amount < 0 ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {f.amount < 0 ? f.amount : `+${f.amount}`}
              </span>
            ))}
            <span
              className={`font-mono text-[11px] ${isDead ? "text-red-400/70" : isLowHp ? "text-red-400 animate-pulse" : "text-slate-300"}`}
            >
              {formatHealth(member)}
            </span>
          </div>
        </div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-900/80">
          <div
            className={`h-full rounded-full bg-gradient-to-r ${barClass} transition-[width] duration-300`}
            style={{ width: isDead ? "100%" : `${pct}%` }}
          />
        </div>
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

export const HudRoot = (): ReactNode => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const authSnapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const members = useMemo(() => snapshot.members, [snapshot.members]);
  const minimapSnapshot = useSyncExternalStore(minimapStore.subscribe, minimapStore.getSnapshot);
  const minimapVisible = minimapSnapshot.visible;
  const toggleMinimap = useCallback(() => minimapStore.toggle(), []);
  const debugSnapshot = useSyncExternalStore(debugStore.subscribe, debugStore.getSnapshot);
  const adminSnapshot = useSyncExternalStore(adminStore.subscribe, adminStore.getSnapshot);
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);
  const isAdmin = authSnapshot.role === "admin";
  const [characterOpen, setCharacterOpen] = useState(false);
  const toggleCharacter = useCallback(() => setCharacterOpen((v) => !v), []);
  const closeCharacter = useCallback(() => setCharacterOpen(false), []);
  const [inventoryOpen, setInventoryOpen] = useState(false);
  const toggleInventory = useCallback(() => setInventoryOpen((v) => !v), []);
  const closeInventory = useCallback(() => setInventoryOpen(false), []);

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
      <div className="absolute inset-x-0 top-3 flex justify-center">
        <span className="rounded-full bg-amber-500/10 px-4 py-1 text-[11px] font-medium text-amber-400/70 backdrop-blur-sm">
          {t("devBanner")}
        </span>
      </div>
      {isAdmin && <DebugPanel />}
      <PauseMenu />
      <GateHint />
      <PromptOverlay />
      <AnnouncementOverlay />
      <TutorialHint />
      <MinimapOverlay />
      {characterOpen && <CharacterPanel onClose={closeCharacter} />}
      {inventoryOpen && <InventoryPanel onClose={closeInventory} />}
      <LootBagPanel />
      <div className="pointer-events-auto absolute left-5 top-1/2 w-60 -translate-y-1/2">
        <div className="mb-3 flex items-center gap-3">
          <div className="h-6 w-6 rounded-full bg-sky-400/20 ring-1 ring-sky-400/40">
            <div className="h-full w-full animate-glow-pulse rounded-full bg-sky-400/40" />
          </div>
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-slate-400">
              {t("party.title")}
            </div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <span>{snapshot.roomName || t("party.subtitle")}</span>
              <span className="rounded bg-slate-700/60 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                {t("party.dungeonLevel", { level: snapshot.dungeonLevel })}
              </span>
            </div>
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
              playUiSfx("ui_click");
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
              playUiSfx("ui_click");
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
        {snapshot.frameMs > 0 && (
          <HudPill mono>
            <span className="text-slate-400">{snapshot.frameMs} ms</span>
          </HudPill>
        )}
        {snapshot.heapMB > 0 && (
          <HudPill mono>
            <span className="text-slate-400">{snapshot.heapMB} MB</span>
          </HudPill>
        )}
        {debugSnapshot.showTickRate && adminSnapshot.tickRate > 0 && (
          <HudPill>
            <span
              className={
                adminSnapshot.tickRate >= adminSnapshot.tickRateTarget * 0.87
                  ? "text-emerald-400"
                  : adminSnapshot.tickRate >= adminSnapshot.tickRateTarget * 0.62
                    ? "text-amber-400"
                    : "text-red-400"
              }
            >
              {adminSnapshot.tickRate} t/s
            </span>
          </HudPill>
        )}
      </div>
      {/* Chat panel — bottom left */}
      <ChatPanel />
      {/* Action feedback — floats above action bar */}
      <ActionFeedback />
      {/* Action bar — bottom center, above XP bar: consumables + skills */}
      <div className="pointer-events-auto absolute bottom-[52px] left-1/2 -translate-x-1/2 flex items-center gap-3">
        <ConsumableSlots />
        <SkillBar />
      </div>
      {/* Stamina bar — thin bar above XP bar, only visible when draining */}
      <StaminaBar />
      {/* XP bar — bottom center (WoW-style) */}
      <XpBar />
      {/* HUD buttons — bottom right */}
      <div className="absolute bottom-5 right-5 flex items-center gap-2">
        <HudButton
          onClick={toggleInventory}
          isOpen={inventoryOpen}
          icon={<BackpackIcon />}
          label={t("inventory.title")}
          shortcut={displayKeyName(settings.keybindings.inventory)}
        />
        <HudButton
          onClick={toggleMinimap}
          isOpen={minimapVisible}
          icon={<MapIcon />}
          label={t("hud.map")}
          shortcut={displayKeyName(settings.keybindings.minimap)}
        />
        <div className="relative">
          <HudButton
            onClick={toggleCharacter}
            isOpen={characterOpen}
            icon={<CharacterIcon />}
            label={t("character.title")}
            shortcut={displayKeyName(settings.keybindings.character)}
          />
          {(localMember?.statPoints ?? 0) > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-sky-500 px-1 text-[10px] font-bold text-white shadow animate-pulse">
              {localMember!.statPoints}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
