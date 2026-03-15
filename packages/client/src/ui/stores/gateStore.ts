import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";

type GateSnapshot = {
  /** Whether the gate is open (synced from server) */
  isOpen: boolean;
  /** Show "Press F" hint when leader is near the gate */
  showInteractHint: boolean;
  /** Show the confirmation prompt */
  showPrompt: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let room: Room | null = null;

let snapshot: GateSnapshot = {
  isOpen: false,
  showInteractHint: false,
  showPrompt: false,
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
    snapshot = { ...snapshot, isOpen: value, showInteractHint: false, showPrompt: false };
    emit();
  },
  setInteractHint(visible: boolean): void {
    if (snapshot.showInteractHint === visible) return;
    snapshot = { ...snapshot, showInteractHint: visible };
    emit();
  },
  showPrompt(): void {
    snapshot = { ...snapshot, showPrompt: true, showInteractHint: false };
    emit();
  },
  hidePrompt(): void {
    snapshot = { ...snapshot, showPrompt: false };
    emit();
  },
  /** Send gate interaction to server */
  confirmOpen(): void {
    if (!room) return;
    room.send(MessageType.GATE_INTERACT);
    snapshot = { ...snapshot, showPrompt: false };
    emit();
  },
  reset(): void {
    room = null;
    snapshot = { isOpen: false, showInteractHint: false, showPrompt: false };
    emit();
  },
};
