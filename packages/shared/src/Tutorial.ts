/**
 * Tutorial step identifiers — used by server to track completion
 * and send hints to new players.
 */
export const TutorialStep = {
  START_DUNGEON: "start_dungeon",
} as const;

export type TutorialStepValue = (typeof TutorialStep)[keyof typeof TutorialStep];
