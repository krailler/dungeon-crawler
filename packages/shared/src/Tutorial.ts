/**
 * Tutorial step identifiers — used by server to track completion
 * and send hints to new players.
 */
export const TutorialStep = {
  START_DUNGEON: "start_dungeon",
  ALLOCATE_STATS: "allocate_stats",
  SPRINT: "sprint",
  YOU_DOWNED: "you_downed",
  TEAMMATE_DOWNED: "teammate_downed",
  FIRST_DEBUFF: "first_debuff",
  ALLOCATE_TALENTS: "allocate_talents",
  DUNGEON_KEY: "dungeon_key",
  PORTAL_NO_KEY: "portal_no_key",
  WELCOME: "welcome",
} as const;

export type TutorialStepValue = (typeof TutorialStep)[keyof typeof TutorialStep];
