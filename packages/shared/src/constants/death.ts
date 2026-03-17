/** How long a player stays in DOWNED state before dying (seconds) */
export const BLEEDOUT_DURATION = 30;

/** How long a teammate must channel to revive a downed player (seconds) */
export const REVIVE_CHANNEL_DURATION = 3.5;

/** Maximum distance (world units) to start/maintain a revive channel */
export const REVIVE_RANGE = 3.0;

/** Fraction of maxHealth restored on revive (0..1) */
export const REVIVE_HP_PERCENT = 0.3;

/** Base respawn timer (seconds) for the first death */
export const RESPAWN_BASE_TIME = 5;

/** Additional seconds added to respawn timer per death */
export const RESPAWN_TIME_INCREMENT = 5;

/** Maximum respawn timer (seconds) */
export const RESPAWN_MAX_TIME = 30;

/** Player life states */
export const LifeState = {
  ALIVE: "alive",
  DOWNED: "downed",
  DEAD: "dead",
} as const;

export type LifeStateValue = (typeof LifeState)[keyof typeof LifeState];
