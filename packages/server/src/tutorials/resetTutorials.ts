import { MessageType, TutorialStep } from "@dungeon/shared";
import type { TutorialHintMessage } from "@dungeon/shared";
import type { PlayerState } from "../state/PlayerState";

/**
 * Reset all completed tutorials for a player and re-send any
 * applicable hints.
 *
 * Returns the number of tutorials that were cleared.
 */
export function resetTutorials(
  player: PlayerState,
  sessionId: string,
  sendToClient: (sessionId: string, type: string, message: unknown) => void,
  dungeonStarted: boolean,
): number {
  const count = player.tutorialsCompleted.size;
  player.tutorialsCompleted.clear();

  // Re-send tutorial hints that now apply
  if (player.isLeader && !dungeonStarted) {
    sendToClient(sessionId, MessageType.TUTORIAL_HINT, {
      step: TutorialStep.START_DUNGEON,
      i18nKey: "tutorial.startDungeon",
    } satisfies TutorialHintMessage);
  }

  if (player.statPoints > 0) {
    sendToClient(sessionId, MessageType.TUTORIAL_HINT, {
      step: TutorialStep.ALLOCATE_STATS,
      i18nKey: "tutorial.allocateStats",
    } satisfies TutorialHintMessage);
  }

  return count;
}
