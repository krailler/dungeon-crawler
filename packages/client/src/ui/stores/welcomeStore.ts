import type { Room } from "@colyseus/sdk";
import { MessageType, TutorialStep } from "@dungeon/shared";

type Listener = () => void;

export type WelcomeSnapshot = {
  visible: boolean;
};

const listeners = new Set<Listener>();
let snapshot: WelcomeSnapshot = { visible: false };
let room: Room | null = null;

const emit = (): void => {
  for (const fn of listeners) fn();
};

export const welcomeStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): WelcomeSnapshot {
    return snapshot;
  },

  setRoom(r: Room): void {
    room = r;
  },

  show(): void {
    snapshot = { visible: true };
    emit();
  },

  dismiss(): void {
    snapshot = { visible: false };
    emit();
    if (room) {
      room.send(MessageType.TUTORIAL_DISMISS, { step: TutorialStep.WELCOME });
    }
  },

  reset(): void {
    snapshot = { visible: false };
    room = null;
    emit();
  },
};
