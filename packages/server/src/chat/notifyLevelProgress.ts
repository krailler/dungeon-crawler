import type { PlayerState } from "../state/PlayerState";
import type { ChatSystem } from "../chat/ChatSystem";
import { MessageType, TutorialStep } from "@dungeon/shared";

/**
 * Single entry-point for all level-progress notifications.
 *
 * Handles:
 *  1. Public broadcast of level-up announcements (one per level in `newLevels`).
 *  2. Private chat message about unassigned stat points + tutorial hint.
 *  3. Private chat message about unassigned talent points + tutorial hint.
 *
 * Both the XP level-up path (GameLoop) and the admin `/setlevel` command
 * call this function — pass an empty `newLevels` array to skip the public
 * broadcast while still notifying about stat points.
 */
export function notifyLevelProgress(
  sessionId: string,
  player: PlayerState,
  newLevels: number[],
  chatSystem: ChatSystem,
  sendToClient: (sessionId: string, type: string, message: unknown) => void,
): void {
  // 1. Public: broadcast each level-up announcement
  for (const level of newLevels) {
    chatSystem.broadcastSystemI18n(
      "chat.levelUp",
      { name: player.characterName, level },
      `${player.characterName} reached level ${level}!`,
    );
  }

  // 2. Private: stat point chat message + tutorial hint
  if (player.statPoints > 0) {
    chatSystem.sendSystemI18nTo(
      sessionId,
      "chat.levelUpStatPoint",
      { total: player.statPoints },
      `+1 attribute point! You have ${player.statPoints} to assign.`,
    );

    if (!player.tutorialsCompleted.has(TutorialStep.ALLOCATE_STATS)) {
      sendToClient(sessionId, MessageType.TUTORIAL_HINT, {
        step: TutorialStep.ALLOCATE_STATS,
        i18nKey: "tutorial.allocateStats",
      });
    }
  }

  // 3. Private: talent point chat message + tutorial hint
  if (player.talentPoints > 0) {
    chatSystem.sendSystemI18nTo(
      sessionId,
      "chat.levelUpTalentPoint",
      { total: player.talentPoints },
      `+1 talent point! You have ${player.talentPoints} to assign.`,
    );

    if (!player.tutorialsCompleted.has(TutorialStep.ALLOCATE_TALENTS)) {
      sendToClient(sessionId, MessageType.TUTORIAL_HINT, {
        step: TutorialStep.ALLOCATE_TALENTS,
        i18nKey: "tutorial.allocateTalents",
      });
    }
  }
}
