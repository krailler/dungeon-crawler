import { useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { playUiSfx } from "../../audio/uiSfx";
import { PROTOCOL_VERSION } from "@dungeon/shared";
import { lobbyStore } from "../stores/lobbyStore";
import { matchmakingStore } from "../stores/matchmakingStore";
import { authStore } from "../stores/authStore";
import { ParticleBackground } from "../components/ParticleBackground";
import { LobbyBackground } from "../components/LobbyBackground";
import { GoldButton } from "../components/GoldButton";
import { GameLogo } from "../components/GameLogo";
import { GoldPanel } from "../components/GoldPanel";
import { SettingsPanel } from "../hud/SettingsPanel";
import { Tooltip } from "../components/Tooltip";
import { assetPreloadStore } from "../stores/assetPreloadStore";

const SwordDivider = (): ReactNode => (
  <div className="flex items-center gap-3 opacity-30">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-600/60 to-transparent" />
    <svg width="16" height="16" viewBox="0 0 16 16" className="text-amber-500/60">
      <path d="M8 1 L9.5 6 L14 8 L9.5 10 L8 15 L6.5 10 L2 8 L6.5 6 Z" fill="currentColor" />
    </svg>
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-600/60 to-transparent" />
  </div>
);

export const LobbyScreen = (): ReactNode => {
  const { t } = useTranslation();
  const lobby = useSyncExternalStore(lobbyStore.subscribe, lobbyStore.getSnapshot);
  const mm = useSyncExternalStore(matchmakingStore.subscribe, matchmakingStore.getSnapshot);
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const preload = useSyncExternalStore(assetPreloadStore.subscribe, assetPreloadStore.getSnapshot);

  const [showSettings, setShowSettings] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const client = authStore.getClient();

  const handleCreate = () => {
    playUiSfx("ui_click");
    lobbyStore.createRoom(client);
  };
  const handleJoin = (roomId: string) => {
    playUiSfx("ui_click");
    lobbyStore.joinRoom(client, roomId);
  };
  const handleLogout = () => {
    playUiSfx("ui_click");
    authStore.logout();
  };

  const handleQuickPlay = () => {
    playUiSfx("ui_queue_start");
    setShowCustom(false);
    matchmakingStore.joinQueue(client, auth.characterLevel ?? 1);
  };
  const handleCancelQueue = () => {
    playUiSfx("ui_click");
    matchmakingStore.leaveQueue();
  };

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 bg-[#05070d]">
      {/* Background */}
      <LobbyBackground />
      <ParticleBackground />

      {/* ── Top-left: Logo ── */}
      <GameLogo size="sm" glow className="absolute left-8 top-8 z-10" />

      {/* ── Top-center: Character card ── */}
      <div className="absolute left-1/2 top-8 z-10 -translate-x-1/2">
        <div className="flex animate-rise-in items-center gap-5 rounded-xl border border-slate-700/30 bg-slate-900/50 px-5 py-3 backdrop-blur-sm">
          {/* Character portrait */}
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-amber-500/25 bg-amber-950/30">
            <img
              src={`/textures/icons/${auth.characterClass === "warrior" ? "sword" : "fist"}.png`}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>

          {/* Character info */}
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-100">
                {auth.characterName ?? "—"}
              </span>
              {auth.characterLevel != null && (
                <span className="text-[10px] text-amber-400/70">Lv.{auth.characterLevel}</span>
              )}
              {auth.role === "admin" && (
                <span className="rounded bg-amber-900/30 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-400/60">
                  admin
                </span>
              )}
            </div>
            <span className="text-[10px] capitalize text-slate-500">
              {auth.characterClass ?? "—"}
            </span>
          </div>

          {/* Separator */}
          <div className="h-8 w-px bg-slate-700/40" />

          {/* Change character (disabled) */}
          <Tooltip content={t("lobby.changeCharacterSoon")} position="bottom">
            <button
              disabled
              className="flex items-center gap-1.5 rounded-lg border border-slate-700/30 bg-slate-800/20 px-3 py-1.5 text-[10px] text-slate-600 opacity-50"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 12 12"
                fill="none"
                className="text-slate-600"
              >
                <path
                  d="M9.5 1.5L10.5 2.5L3 10H2V9L9.5 1.5Z"
                  stroke="currentColor"
                  strokeWidth="1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              {t("lobby.changeCharacter")}
            </button>
          </Tooltip>
        </div>
      </div>

      {/* ── Bottom-left: Settings + Logout + version ── */}
      <div className="absolute bottom-6 left-8 z-10 flex flex-col items-start gap-1.5">
        <button
          onClick={() => {
            playUiSfx("ui_click");
            setShowSettings(true);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-1.5 text-[10px] text-slate-500 transition-colors hover:border-slate-600/50 hover:bg-slate-800/50 hover:text-slate-400"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-current">
            <path
              d="M6 7.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
              stroke="currentColor"
              strokeWidth="1"
            />
            <path
              d="M9.7 7.4l.5.9a.5.5 0 01-.1.6l-.8.6a.5.5 0 01-.6 0l-.6-.4a3.6 3.6 0 01-1 .5l-.1.7a.5.5 0 01-.5.4H5.5a.5.5 0 01-.5-.4l-.1-.7a3.6 3.6 0 01-1-.5l-.6.4a.5.5 0 01-.6 0l-.8-.6a.5.5 0 01-.1-.6l.5-.9a3.6 3.6 0 010-1l-.5-.8a.5.5 0 01.1-.6l.8-.6a.5.5 0 01.6 0l.6.4a3.6 3.6 0 011-.5l.1-.7A.5.5 0 015.5 3h1a.5.5 0 01.5.4l.1.7a3.6 3.6 0 011 .5l.6-.4a.5.5 0 01.6 0l.8.6a.5.5 0 01.1.6l-.5.9a3.6 3.6 0 010 1z"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
          {t("lobby.settings")}
        </button>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-3 py-1.5 text-[10px] text-slate-500 transition-colors hover:border-slate-600/50 hover:bg-slate-800/50 hover:text-slate-400"
        >
          {t("lobby.logout")}
        </button>
        <span className="pl-0.5 text-[10px] text-slate-700">Build Version: {PROTOCOL_VERSION}</span>
        {!preload.done && preload.total > 0 && (
          <div className="flex items-center gap-2 pl-0.5">
            <div className="h-1 w-24 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-amber-600/50 transition-all duration-300"
                style={{ width: `${Math.round(preload.progress * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-slate-700">
              {t("lobby.preloading")} {Math.round(preload.progress * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* ── Settings modal ── */}
      {showSettings && (
        <div
          className="absolute inset-0 z-[600] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="w-[420px] rounded-2xl border border-slate-600/40 bg-slate-900/95 px-6 py-6 shadow-2xl backdrop-blur"
            onClick={(e) => e.stopPropagation()}
          >
            <SettingsPanel onBack={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {/* ── Bottom-right: Play panel ── */}
      <div className="absolute bottom-8 right-8 z-10 flex w-[380px] flex-col items-stretch gap-3 animate-rise-in">
        {/* Quick Play — queue status or button */}
        {mm.queued ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-700/30 bg-slate-900/60 px-6 py-4 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
              <span className="text-sm text-slate-300">{t("lobby.searching")}</span>
            </div>
            <p className="text-xs text-slate-500">
              {t("lobby.queueStatus", { count: mm.playersInQueue })}
            </p>
            <button
              onClick={handleCancelQueue}
              className="rounded-lg border border-slate-700/40 bg-slate-800/30 px-4 py-1.5 text-xs text-slate-500 transition-colors hover:border-red-500/30 hover:text-red-400"
            >
              {t("lobby.cancelQueue")}
            </button>
          </div>
        ) : (
          <button
            onClick={handleQuickPlay}
            disabled={lobby.joining}
            className="lobby-quick-play-btn w-full rounded-xl px-6 py-5 text-base font-extrabold uppercase tracking-[0.2em] text-white disabled:pointer-events-none disabled:opacity-40"
          >
            <span className="relative z-10">{t("lobby.quickPlay")}</span>
          </button>
        )}

        {/* Custom Game toggle — hidden while in queue */}
        {!mm.queued && (
          <button
            onClick={() => {
              playUiSfx("ui_click");
              setShowCustom(!showCustom);
            }}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700/30 bg-slate-900/40 px-4 py-2.5 text-xs text-slate-400 backdrop-blur-sm transition-colors hover:border-slate-600/40 hover:bg-slate-900/60 hover:text-slate-300"
          >
            {t("lobby.customGame")}
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              className={`text-current transition-transform ${showCustom ? "rotate-180" : ""}`}
            >
              <path
                d="M2 6.5L5 3.5L8 6.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      {/* ── Right side: Custom room list (shown on toggle) ── */}
      {showCustom && (
        <div className="absolute right-8 top-8 bottom-[160px] z-10 flex w-[380px] flex-col animate-rise-in">
          <GoldPanel className="h-full" innerClassName="flex h-full flex-col">
            {/* Title */}
            <h2
              className="mb-1 text-center text-sm font-bold uppercase tracking-[0.25em] text-amber-400/90"
              style={{ animation: "lobby-title-glow 4s ease-in-out infinite" }}
            >
              {t("lobby.title")}
            </h2>

            <SwordDivider />

            {/* Room list */}
            <div className="my-4 flex flex-1 flex-col gap-2.5 overflow-y-auto pr-1">
              {lobby.rooms.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3">
                  <div className="text-2xl opacity-20">&#9876;</div>
                  <p className="text-xs text-slate-500">{t("lobby.noRooms")}</p>
                </div>
              ) : (
                lobby.rooms.map((room) => (
                  <button
                    key={room.roomId}
                    onClick={() => handleJoin(room.roomId)}
                    disabled={lobby.joining}
                    className="lobby-room-card flex items-center justify-between rounded-xl bg-slate-800/40 px-4 py-3.5 text-left disabled:pointer-events-none disabled:opacity-30"
                  >
                    <div className="relative z-10">
                      <div className="text-sm font-semibold text-slate-100">
                        {room.metadata?.roomName ?? room.roomId.slice(0, 8)}
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[10px] text-slate-500">
                        <span className="font-mono">{room.roomId.slice(0, 8).toUpperCase()}</span>
                        {room.metadata?.dungeonLevel > 0 && (
                          <span className="rounded bg-amber-900/30 px-1.5 py-0.5 text-amber-400/80">
                            {t("lobby.level", { level: room.metadata.dungeonLevel })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="relative z-10 flex items-center gap-3">
                      <span className="text-xs tabular-nums text-slate-400">
                        {room.clients}
                        <span className="text-slate-600">/{room.metadata?.maxPlayers ?? 5}</span>
                      </span>
                      <span
                        className="inline-block h-2 w-2 rounded-full bg-emerald-400 text-emerald-400"
                        style={{ animation: "lobby-status-pulse 2s ease-in-out infinite" }}
                      />
                      <span className="text-xs font-medium text-amber-500/80">
                        {t("lobby.join")} &#8250;
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Error */}
            {lobby.error && (
              <p className="mb-3 text-center text-xs text-red-400 animate-rise-in">{lobby.error}</p>
            )}

            <SwordDivider />

            {/* Create room */}
            <GoldButton onClick={handleCreate} loading={lobby.joining} className="mt-4">
              {lobby.joining ? t("lobby.joining") : t("lobby.createRoom")}
            </GoldButton>
          </GoldPanel>
        </div>
      )}
    </div>
  );
};
