import type { Client, Room } from "@colyseus/sdk";
import { PROTOCOL_VERSION } from "@dungeon/shared";

type Listener = () => void;

export type MatchmakingSnapshot = {
  /** Whether the player is currently in the matchmaking queue */
  queued: boolean;
  /** Number of players in the queue */
  playersInQueue: number;
  /** Player's position in the queue */
  position: number;
};

const listeners = new Set<Listener>();
let room: Room | null = null;
let snapshot: MatchmakingSnapshot = {
  queued: false,
  playersInQueue: 0,
  position: 0,
};

// Callback invoked when a dungeon room is matched
let onMatched: ((roomId: string) => void) | null = null;

function emit(): void {
  for (const fn of listeners) fn();
}

function update(partial: Partial<MatchmakingSnapshot>): void {
  snapshot = { ...snapshot, ...partial };
  emit();
}

export const matchmakingStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): MatchmakingSnapshot {
    return snapshot;
  },

  /** Set the callback that fires when a match is found */
  setOnMatched(cb: (roomId: string) => void): void {
    onMatched = cb;
  },

  /** Join the matchmaking queue */
  async joinQueue(client: Client, level: number): Promise<void> {
    if (room) return; // Already queued

    try {
      room = await client.joinOrCreate("matchmaking", {
        level,
        protocolVersion: PROTOCOL_VERSION,
      });

      update({ queued: true, playersInQueue: 1, position: 1 });

      room.onMessage("queue_status", (data: { playersInQueue: number; position: number }) => {
        update({ playersInQueue: data.playersInQueue, position: data.position });
      });

      room.onMessage("matched", (data: { roomId: string }) => {
        const roomId = data.roomId;
        // Leave matchmaking room
        room?.leave();
        room = null;
        update({ queued: false, playersInQueue: 0, position: 0 });
        // Notify — lobby will handle joining the dungeon room
        onMatched?.(roomId);
      });

      room.onLeave(() => {
        room = null;
        update({ queued: false, playersInQueue: 0, position: 0 });
      });
    } catch (err) {
      console.error("[Matchmaking] Failed to join queue:", err);
      room = null;
      update({ queued: false });
    }
  },

  /** Leave the matchmaking queue */
  leaveQueue(): void {
    room?.leave();
    room = null;
    update({ queued: false, playersInQueue: 0, position: 0 });
  },

  /** Reset state */
  reset(): void {
    room?.leave();
    room = null;
    snapshot = { queued: false, playersInQueue: 0, position: 0 };
  },
};
