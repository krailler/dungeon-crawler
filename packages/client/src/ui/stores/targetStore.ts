import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type { SetTargetMessage } from "@dungeon/shared";

type Listener = () => void;

export type TargetType = "creature" | "player";

export type TargetSnapshot = {
  targetId: string | null;
  targetType: TargetType | null;
  /** Whether the local player is close enough to revive (computed from 3D positions). */
  inReviveRange: boolean;
};

const EMPTY: TargetSnapshot = {
  targetId: null,
  targetType: null,
  inReviveRange: false,
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

  selectCreature(id: string): void {
    snapshot = { targetId: id, targetType: "creature", inReviveRange: false };
    emit();
    room?.send(MessageType.SET_TARGET, { targetId: id } satisfies SetTargetMessage);
  },

  selectPlayer(id: string): void {
    snapshot = { targetId: id, targetType: "player", inReviveRange: false };
    emit();
    room?.send(MessageType.SET_TARGET, {
      targetId: id,
      targetType: "player",
    } satisfies SetTargetMessage);
  },

  /** Update the revive-range flag (computed from 3D world positions in StateSync). */
  setInReviveRange(inRange: boolean): void {
    if (snapshot.targetId === null || snapshot.targetType !== "player") return;
    if (snapshot.inReviveRange === inRange) return;
    snapshot = { ...snapshot, inReviveRange: inRange };
    emit();
  },

  clear(): void {
    if (snapshot.targetId === null) return;
    snapshot = EMPTY;
    emit();
    room?.send(MessageType.SET_TARGET, { targetId: null } satisfies SetTargetMessage);
  },

  reset(): void {
    snapshot = EMPTY;
    room = null;
    emit();
  },
};
