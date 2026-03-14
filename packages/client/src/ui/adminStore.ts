import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type { AdminRestartMessage } from "@dungeon/shared";

let room: Room | null = null;
let seed: number = 0;
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
    seed = 0;
    emit();
  },
  setSeed(s: number): void {
    seed = s;
    emit();
  },
  getSeed(): number {
    return seed;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  getSnapshot(): number {
    return seed;
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
