import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PROTOCOL_VERSION } from "@dungeon/shared";
import { lobbyStore } from "../stores/lobbyStore";
import { authStore } from "../stores/authStore";
import { ParticleBackground } from "../components/ParticleBackground";

export const LobbyScreen = (): ReactNode => {
  const { t } = useTranslation();
  const lobby = useSyncExternalStore(lobbyStore.subscribe, lobbyStore.getSnapshot);

  const client = authStore.getClient();

  const handleCreate = () => lobbyStore.createRoom(client);
  const handleJoin = (roomId: string) => lobbyStore.joinRoom(client, roomId);
  const handleLogout = () => authStore.logout();

  return (
    <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070d]">
      {/* Background */}
      <img
        src="/textures/login-bg.png"
        alt=""
        className="pointer-events-none absolute left-1/2 top-1/2 max-h-full max-w-full -translate-x-1/2 -translate-y-1/2"
      />
      <div className="absolute inset-0 bg-[#05070d]/75" />
      <ParticleBackground />

      {/* Logo */}
      <img
        src="/textures/logo.png"
        alt="KrawlHero"
        className="relative z-10 mb-8 h-16 w-auto drop-shadow-[0_0_20px_rgba(255,180,50,0.3)]"
      />

      {/* Room list panel */}
      <div className="relative z-10 flex w-96 flex-col rounded-xl border border-slate-600/30 bg-slate-900/60 p-6 shadow-2xl backdrop-blur-sm">
        <h2 className="mb-4 text-center text-sm font-semibold uppercase tracking-widest text-slate-300">
          {t("lobby.title")}
        </h2>

        {/* Room list */}
        <div className="mb-4 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {lobby.rooms.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">{t("lobby.noRooms")}</p>
          ) : (
            lobby.rooms.map((room) => (
              <button
                key={room.roomId}
                onClick={() => handleJoin(room.roomId)}
                disabled={lobby.joining}
                className="flex items-center justify-between rounded-lg border border-slate-600/30 bg-slate-800/50 px-4 py-3 text-left transition-colors hover:border-amber-500/40 hover:bg-slate-800/80 disabled:opacity-40"
              >
                <div>
                  <div className="text-sm font-medium text-slate-200">
                    {room.metadata?.roomName ?? room.roomId.slice(0, 8)}
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-500">
                    <span>{room.roomId.slice(0, 8).toUpperCase()}</span>
                    {room.metadata?.dungeonLevel > 0 && (
                      <span className="text-amber-500/70">
                        {t("lobby.level", { level: room.metadata.dungeonLevel })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">
                    {room.clients}/{room.metadata?.maxPlayers ?? 5}
                  </span>
                  <span className="text-[10px] text-amber-400/80">{t("lobby.join")}</span>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Error message */}
        {lobby.error && <p className="mb-3 text-center text-xs text-red-400">{lobby.error}</p>}

        {/* Create room button */}
        <button
          onClick={handleCreate}
          disabled={lobby.joining}
          className="rounded-lg bg-amber-600/90 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-500/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {lobby.joining ? t("lobby.joining") : t("lobby.createRoom")}
        </button>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="mt-3 text-xs text-slate-500 transition-colors hover:text-slate-300"
        >
          {t("lobby.logout")}
        </button>
      </div>

      {/* Version */}
      <span className="absolute bottom-3 right-4 text-[10px] text-slate-600">
        Build Version: {PROTOCOL_VERSION}
      </span>
    </div>
  );
};
