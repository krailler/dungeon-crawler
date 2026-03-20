import { Client, Room } from "@colyseus/sdk";
import type { RoomAvailable } from "@colyseus/sdk";
import { PROTOCOL_VERSION } from "@dungeon/shared";
import { SERVER_URL } from "./authStore";
import { t } from "../../i18n/i18n";

/** Ask the server which room this account is currently in (if any). */
async function fetchAccountRoom(client: Client): Promise<string | null> {
  try {
    const token = (client.auth as { token?: string }).token;
    if (!token) return null;
    const res = await fetch(`${SERVER_URL}/reconnect-room`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { roomId: string | null };
    return data.roomId;
  } catch {
    return null;
  }
}

type Listener = () => void;

export type LobbySnapshot = {
  rooms: RoomAvailable[];
  joining: boolean;
  error: string | null;
};

const listeners = new Set<Listener>();
let lobby: Room | null = null;
let snapshot: LobbySnapshot = {
  rooms: [],
  joining: false,
  error: null,
};

// Callback invoked when a dungeon room is successfully joined
let onRoomJoined: ((room: Room) => void) | null = null;
// Callback invoked when the player wants to leave the current room and return to lobby
let onReturnToLobby: (() => void) | null = null;
// Flag set when intentionally leaving a room (prevents disconnect screen)
let leavingIntentionally = false;

function emit(): void {
  for (const fn of listeners) fn();
}

function update(partial: Partial<LobbySnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emit();
}

export const lobbyStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): LobbySnapshot {
    return snapshot;
  },

  /** Set the callback that main.ts uses to start the game when a room is joined */
  setOnRoomJoined(cb: (room: Room) => void): void {
    onRoomJoined = cb;
  },

  /** Set the callback that main.ts uses to tear down the game and return to lobby */
  setOnReturnToLobby(cb: () => void): void {
    onReturnToLobby = cb;
  },

  /** Returns true if the player is intentionally leaving (not a disconnect) */
  isLeavingIntentionally(): boolean {
    return leavingIntentionally;
  },

  /** Clear the intentional leave flag (called after the leave is processed) */
  clearLeavingFlag(): void {
    leavingIntentionally = false;
  },

  /** Leave the current dungeon room and return to the lobby screen */
  returnToLobby(): void {
    leavingIntentionally = true;
    localStorage.removeItem("reconnectionToken");
    localStorage.removeItem("reconnectionRoomId");
    onReturnToLobby?.();
  },

  /** Connect to the built-in LobbyRoom for real-time room listing */
  async connect(client: Client): Promise<void> {
    if (lobby) return;
    try {
      lobby = await client.joinOrCreate("lobby", {
        filter: { name: "dungeon" },
      });

      // Full room list on initial connect
      lobby.onMessage("rooms", (rooms: RoomAvailable[]) => {
        update({ rooms: rooms.filter((r) => !r.metadata?.started) });
      });

      // Room added or updated
      lobby.onMessage("+", ([roomId, room]: [string, RoomAvailable]) => {
        const current = snapshot.rooms;
        const idx = current.findIndex((r) => r.roomId === roomId);

        // Hide started rooms
        if (room.metadata?.started) {
          if (idx !== -1) {
            update({ rooms: current.filter((r) => r.roomId !== roomId) });
          }
          return;
        }

        if (idx !== -1) {
          const next = [...current];
          next[idx] = room;
          update({ rooms: next });
        } else {
          update({ rooms: [...current, room] });
        }
      });

      // Room removed
      lobby.onMessage("-", (roomId: string) => {
        update({ rooms: snapshot.rooms.filter((r) => r.roomId !== roomId) });
      });

      lobby.onLeave(() => {
        lobby = null;
      });
    } catch (err) {
      console.error("[Lobby] Failed to connect:", err);
    }
  },

  /** Create a new dungeon room and join it */
  async createRoom(client: Client): Promise<void> {
    update({ joining: true, error: null });
    try {
      const room = await client.create("dungeon", { protocolVersion: PROTOCOL_VERSION });
      update({ joining: false });
      lobby?.leave();
      lobby = null;
      onRoomJoined?.(room);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      update({ joining: false, error: msg });
    }
  },

  /** Join an existing dungeon room by id */
  async joinRoom(client: Client, roomId: string): Promise<void> {
    update({ joining: true, error: null });
    try {
      const room = await client.joinById(roomId, { protocolVersion: PROTOCOL_VERSION });
      update({ joining: false });
      lobby?.leave();
      lobby = null;
      onRoomJoined?.(room);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("DUNGEON_STARTED")) {
        update({ joining: false, error: t("lobby.roomStarted") });
      } else if (msg.includes("ROOM_FULL")) {
        update({ joining: false, error: t("lobby.roomFull") });
      } else {
        update({ joining: false, error: msg });
      }
    }
  },

  /** Try to reconnect to a previous room session.
   *  1. Try `client.reconnect(token)` — works when server called allowReconnection (onDrop path)
   *  2. If that fails, try `client.joinById(roomId)` — triggers session migration (onLeave/page reload path)
   *  3. If local paths fail, ask server which room the account is in (fallback for localStorage cleared)
   *  4. If all fail, clean up and return false
   */
  async tryReconnect(client: Client): Promise<boolean> {
    const savedToken = localStorage.getItem("reconnectionToken");
    const savedRoomId = localStorage.getItem("reconnectionRoomId");

    // Path 1: Colyseus reconnect (seat was reserved via allowReconnection)
    if (savedToken) {
      try {
        const room = await client.reconnect(savedToken);
        console.log("[Lobby] Reconnected to room:", room.sessionId);
        onRoomJoined?.(room);
        return true;
      } catch (err) {
        console.warn("[Lobby] Token reconnection failed:", err);
        localStorage.removeItem("reconnectionToken");
      }
    }

    // Path 2: Rejoin by room ID from localStorage (session migration via onAuth/handleJoin)
    if (savedRoomId) {
      try {
        const room = await client.joinById(savedRoomId, { protocolVersion: PROTOCOL_VERSION });
        console.log("[Lobby] Rejoined room via session migration:", room.sessionId);
        localStorage.removeItem("reconnectionRoomId");
        onRoomJoined?.(room);
        return true;
      } catch (err) {
        console.warn("[Lobby] Room rejoin failed:", err);
        localStorage.removeItem("reconnectionRoomId");
      }
    }

    // Path 3: Ask server which room the account is in (localStorage cleared or both paths above failed)
    const serverRoomId = await fetchAccountRoom(client);
    if (serverRoomId) {
      try {
        const room = await client.joinById(serverRoomId, { protocolVersion: PROTOCOL_VERSION });
        console.log("[Lobby] Rejoined room via server lookup:", room.sessionId);
        onRoomJoined?.(room);
        return true;
      } catch (err) {
        console.warn("[Lobby] Server room rejoin failed:", err);
      }
    }

    return false;
  },

  /** Disconnect from lobby and reset state */
  disconnect(): void {
    lobby?.leave();
    lobby = null;
    update({ rooms: [], joining: false, error: null });
  },

  reset(): void {
    lobby?.leave();
    lobby = null;
    snapshot = { rooms: [], joining: false, error: null };
  },
};
