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
  /** Target HP fraction threshold (0–1). Skill can only be used when target HP% ≤ this value. 0 = no threshold. */
  readonly hpThreshold: number;
  /** If true, cooldown resets when the target dies from this skill's hit */
  readonly resetOnKill: boolean;
  /** Effect ID to apply when skill is used (buff/debuff skill). Empty = damage skill. */
  readonly effectId: string;
  /** AoE radius for the skill. 0 = single target (or self-only for buffs). */
  readonly aoeRange: number;
};
