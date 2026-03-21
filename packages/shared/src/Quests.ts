/** Quest type identifiers */
export const QuestType = {
  KILL_ALL: "kill_all",
  BOSS_TIMED: "boss_timed",
  NO_DEATHS: "no_deaths",
} as const;
export type QuestTypeValue = (typeof QuestType)[keyof typeof QuestType];

/** Quest status */
export const QuestStatus = {
  ACTIVE: "active",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;
export type QuestStatusValue = (typeof QuestStatus)[keyof typeof QuestStatus];

/** Base time limit for boss_timed quest (seconds) */
export const BOSS_TIMER_BASE = 30;
/** Additional seconds per dungeon level */
export const BOSS_TIMER_PER_LEVEL = 2;

/** Bonus gold per completed quest = dungeonLevel * this */
export const QUEST_BONUS_GOLD_PER_LEVEL = 10;
/** Bonus XP per completed quest = dungeonLevel * this */
export const QUEST_BONUS_XP_PER_LEVEL = 25;
