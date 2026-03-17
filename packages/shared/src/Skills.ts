/** Maximum number of skill slots in the action bar */
export const MAX_SKILL_SLOTS = 5;

/** Skill definition loaded from the database at server startup */
export type SkillDef = {
  readonly id: string;
  /** i18n key for the skill name (client translates via t()) */
  readonly name: string;
  /** i18n key for the skill description */
  readonly description: string;
  /** Icon identifier (client maps to SVG component) */
  readonly icon: string;
  /** true = always-on toggle, false = activated on use */
  readonly passive: boolean;
  /** Cooldown in seconds (0 = no cooldown) */
  readonly cooldown: number;
  /** Damage multiplier (1 = normal) */
  readonly damageMultiplier: number;
  /** Animation state triggered on use (e.g. "punch", "heavy_punch") */
  readonly animState: string;
};

/** Default skill IDs assigned to new characters (fallback for legacy characters without DB skills) */
export const DEFAULT_SKILL_IDS = ["basic_attack", "heavy_strike"] as const;
