import type { Room } from "@colyseus/sdk";
import { MessageType, LifeState } from "@dungeon/shared";
import type { LifeStateValue, ReviveStartMessage } from "@dungeon/shared";

type Listener = () => void;

export type DeathSnapshot = {
  lifeState: LifeStateValue;
  bleedTimer: number;
  respawnTimer: number;
  reviveProgress: number;
  reviverName: string;
};

const EMPTY: DeathSnapshot = {
  lifeState: LifeState.ALIVE,
  bleedTimer: 0,
  respawnTimer: 0,
  reviveProgress: 0,
  reviverName: "",
};

const listeners = new Set<Listener>();
let snapshot: DeathSnapshot = { ...EMPTY };
let room: Room | null = null;

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const deathStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): DeathSnapshot {
    return snapshot;
  },

  setRoom(r: Room): void {
    room = r;
  },

  clearRoom(): void {
    room = null;
  },

  /** Called from StateSync when local player's death fields change */
  update(
    lifeState: LifeStateValue,
    bleedTimer: number,
    respawnTimer: number,
    reviveProgress: number,
    reviverName: string,
  ): void {
    snapshot = { lifeState, bleedTimer, respawnTimer, reviveProgress, reviverName };
    emit();
  },

  /** Send revive start message to server */
  startRevive(targetSessionId: string): void {
    if (!room) return;
    room.send(MessageType.REVIVE_START, { targetSessionId } satisfies ReviveStartMessage);
  },

  reset(): void {
    snapshot = { ...EMPTY };
    room = null;
    emit();
  },
};
