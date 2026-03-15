/** Maximum number of skill slots in the action bar */
export const MAX_SKILL_SLOTS = 5;

/** Skill IDs — use `as const` object instead of enum (erasableSyntaxOnly) */
export const SkillId = {
  BASIC_ATTACK: "basic_attack",
} as const;

export type SkillIdValue = (typeof SkillId)[keyof typeof SkillId];

/** Skill icon identifiers (client maps these to SVG components) */
export type SkillIcon = "sword";

export type SkillDef = {
  readonly id: SkillIdValue;
  readonly i18nKey: string;
  readonly i18nDescKey: string;
  readonly icon: SkillIcon;
  readonly passive: boolean;
};

/** All skill definitions, keyed by skill ID */
export const SKILL_DEFS: Record<SkillIdValue, SkillDef> = {
  [SkillId.BASIC_ATTACK]: {
    id: SkillId.BASIC_ATTACK,
    i18nKey: "skills.basicAttack",
    i18nDescKey: "skills.basicAttackDesc",
    icon: "sword",
    passive: true,
  },
};

/** Default skills assigned to new players */
export const DEFAULT_SKILLS: readonly SkillIdValue[] = [SkillId.BASIC_ATTACK];
