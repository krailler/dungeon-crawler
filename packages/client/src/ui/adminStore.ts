import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type { AdminRestartMessage } from "@dungeon/shared";

type AdminSnapshot = {
  seed: number;
  tickRate: number;
};

let room: Room | null = null;
let snapshot: AdminSnapshot = { seed: 0, tickRate: 0 };
let listeners: Set<() => void> = new Set();

function emit(): void {
  for (const fn of listeners) fn();
}

export const adminStore = {
  setRoom(r: Room): void {
    room = r;
  },
  clearRoom(): void {
    room = null;
    snapshot = { seed: 0, tickRate: 0 };
    emit();
  },
  setSeed(s: number): void {
    snapshot = { ...snapshot, seed: s };
    emit();
  },
  setTickRate(value: number): void {
    snapshot = { ...snapshot, tickRate: value };
    emit();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot(): AdminSnapshot {
    return snapshot;
  },
  restartRoom(seedOverride?: number | null): void {
    if (!room) return;
    const msg: AdminRestartMessage = { seed: seedOverride ?? null };
    room.send(MessageType.ADMIN_RESTART, msg);
  },
  randomRestart(): void {
    if (!room) return;
    const s = Math.floor(Math.random() * 0x7fffffff);
    const msg: AdminRestartMessage = { seed: s };
    room.send(MessageType.ADMIN_RESTART, msg);
  },
};
