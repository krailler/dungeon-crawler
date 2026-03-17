import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type { SetTargetMessage } from "@dungeon/shared";

type Listener = () => void;

export type TargetType = "creature" | "player";

export type TargetSnapshot = {
  targetId: string | null;
  targetType: TargetType | null;
  name: string;
  health: number;
  maxHealth: number;
  level: number;
  isDead: boolean;
};

const EMPTY: TargetSnapshot = {
  targetId: null,
  targetType: null,
  name: "",
  health: 0,
  maxHealth: 0,
  level: 0,
  isDead: false,
};

const listeners = new Set<Listener>();
let snapshot: TargetSnapshot = EMPTY;
let room: Room | null = null;

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const targetStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): TargetSnapshot {
    return snapshot;
  },

  setRoom(r: Room): void {
    room = r;
  },

  clearRoom(): void {
    room = null;
  },

  selectCreature(id: string, name: string, health: number, maxHealth: number, level: number): void {
    snapshot = {
      targetId: id,
      targetType: "creature",
      name,
      health,
      maxHealth,
      level,
      isDead: false,
    };
    emit();
    room?.send(MessageType.SET_TARGET, { targetId: id } satisfies SetTargetMessage);
  },

  selectPlayer(id: string, name: string, health: number, maxHealth: number, level: number): void {
    snapshot = {
      targetId: id,
      targetType: "player",
      name,
      health,
      maxHealth,
      level,
      isDead: false,
    };
    emit();
    // No server message — player targets don't affect combat (no PvP)
  },

  updateHealth(health: number, maxHealth: number, isDead: boolean): void {
    if (snapshot.targetId === null) return;
    snapshot = { ...snapshot, health, maxHealth, isDead };
    emit();
  },

  clear(): void {
    if (snapshot.targetId === null) return;
    const wasCreature = snapshot.targetType === "creature";
    snapshot = EMPTY;
    emit();
    if (wasCreature) {
      room?.send(MessageType.SET_TARGET, { targetId: null } satisfies SetTargetMessage);
    }
  },

  reset(): void {
    snapshot = EMPTY;
    room = null;
    emit();
  },
};
