import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type { TutorialHintMessage } from "@dungeon/shared";
import { playUiSfx } from "../../audio/uiSfx";

export type TutorialHint = {
  step: string;
  i18nKey: string;
};

export type TutorialSnapshot = {
  currentHint: TutorialHint | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let currentHint: TutorialHint | null = null;
let room: Room | null = null;

let cachedSnapshot: TutorialSnapshot = { currentHint: null };

const rebuildSnapshot = (): void => {
  cachedSnapshot = { currentHint };
};

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const tutorialStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): TutorialSnapshot {
    return cachedSnapshot;
  },

  setRoom(r: Room): void {
    room = r;
  },

  showHint(msg: TutorialHintMessage): void {
    currentHint = { step: msg.step, i18nKey: msg.i18nKey };
    rebuildSnapshot();
    emit();
    playUiSfx("ui_tutorial");
  },

  /**
   * Dismiss the current hint.
   * @param expectedStep — only dismiss if this matches the current hint step
   * @param notifyServer — whether to send TUTORIAL_DISMISS to the server (default: true).
   *                        Pass false when the dismiss originates from the server.
   */
  dismiss(expectedStep?: string, notifyServer: boolean = true): void {
    if (!currentHint) return;
    if (expectedStep && currentHint.step !== expectedStep) return;
    const step = currentHint.step;
    currentHint = null;
    rebuildSnapshot();
    emit();

    // Notify server that this tutorial step was dismissed/completed
    if (notifyServer && room) {
      room.send(MessageType.TUTORIAL_DISMISS, { step });
    }
  },

  /** Player-initiated: reset all completed tutorials (sends message to server) */
  resetAll(): void {
    if (!room) return;
    room.send(MessageType.TUTORIAL_RESET);
  },

  reset(): void {
    currentHint = null;
    room = null;
    rebuildSnapshot();
    emit();
  },
};
