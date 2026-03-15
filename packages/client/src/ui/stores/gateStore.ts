import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";

type GateSnapshot = {
  /** Whether the gate is open (synced from server) */
  isOpen: boolean;
  /** Show "Press F" hint when leader is near the gate */
  showInteractHint: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let room: Room | null = null;

let snapshot: GateSnapshot = {
  isOpen: false,
  showInteractHint: false,
};

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const gateStore = {
  setRoom(r: Room): void {
    room = r;
  },
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): GateSnapshot {
    return snapshot;
  },
  setOpen(value: boolean): void {
    if (snapshot.isOpen === value) return;
    snapshot = { ...snapshot, isOpen: value, showInteractHint: false };
    emit();
  },
  setInteractHint(visible: boolean): void {
    if (snapshot.showInteractHint === visible) return;
    snapshot = { ...snapshot, showInteractHint: visible };
    emit();
  },
  /** Send gate interaction to server */
  confirmOpen(): void {
    if (!room) return;
    room.send(MessageType.GATE_INTERACT);
    emit();
  },
  reset(): void {
    room = null;
    snapshot = { isOpen: false, showInteractHint: false };
    emit();
  },
};
