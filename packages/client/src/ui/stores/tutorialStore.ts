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
/** LIFO stack — last element is the currently visible hint. */
const hintStack: TutorialHint[] = [];
let room: Room | null = null;

let cachedSnapshot: TutorialSnapshot = { currentHint: null };

const rebuildSnapshot = (): void => {
  const top = hintStack.length > 0 ? hintStack[hintStack.length - 1] : null;
  cachedSnapshot = { currentHint: top };
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
    // Don't add duplicate steps to the stack
    const existing = hintStack.findIndex((h) => h.step === msg.step);
    if (existing !== -1) {
      // Move to top
      hintStack.splice(existing, 1);
    }
    hintStack.push({ step: msg.step, i18nKey: msg.i18nKey });
    rebuildSnapshot();
    emit();
    playUiSfx("ui_tutorial");
  },

  /**
   * Dismiss a hint from the stack.
   * @param expectedStep — only dismiss if this matches a hint in the stack
   * @param notifyServer — whether to send TUTORIAL_DISMISS to the server (default: true).
   *                        Pass false when the dismiss originates from the server.
   */
  dismiss(expectedStep?: string, notifyServer: boolean = true): void {
    if (hintStack.length === 0) return;

    if (expectedStep) {
      // Remove the specific step from the stack (wherever it is)
      const idx = hintStack.findIndex((h) => h.step === expectedStep);
      if (idx === -1) return;
      hintStack.splice(idx, 1);
    } else {
      // No specific step — dismiss the top (visible) hint
      const top = hintStack.pop()!;
      expectedStep = top.step;
    }

    rebuildSnapshot();
    emit();

    // Notify server that this tutorial step was dismissed/completed
    if (notifyServer && room) {
      room.send(MessageType.TUTORIAL_DISMISS, { step: expectedStep });
    }
  },

  /** Player-initiated: reset all completed tutorials (sends message to server) */
  resetAll(): void {
    if (!room) return;
    room.send(MessageType.TUTORIAL_RESET);
  },

  reset(): void {
    hintStack.length = 0;
    room = null;
    rebuildSnapshot();
    emit();
  },
};
