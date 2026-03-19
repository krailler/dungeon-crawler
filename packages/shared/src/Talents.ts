import type { StatModTypeValue } from "./Effects.js";

/** What a talent rank provides */
export const TalentEffectType = {
  /** Passive stat modifier (flat or percent) */
  STAT_MOD: "stat_mod",
  /** Unlocks a new skill for the player */
  UNLOCK_SKILL: "unlock_skill",
  /** Modifies an existing skill's properties */
  MODIFY_SKILL: "modify_skill",
} as const;
export type TalentEffectTypeValue = (typeof TalentEffectType)[keyof typeof TalentEffectType];

/** Stat modifier granted by a talent rank */
export type TalentStatModifier = {
  readonly stat: string;
  readonly type: StatModTypeValue;
  readonly value: number;
};

/** Skill modification granted by a talent rank */
export type TalentSkillModifier = {
  readonly skillId: string;
  readonly cooldownMul?: number;
  readonly damageMul?: number;
};

/** What a single rank of a talent grants */
export type TalentRankEffect = {
  readonly rank: number;
  readonly effectType: TalentEffectTypeValue;
  readonly statModifier?: TalentStatModifier;
  readonly skillId?: string;
  readonly skillModifier?: TalentSkillModifier;
};

/** Talent definition loaded from DB at server startup */
export type TalentDef = {
  readonly id: string;
  readonly classId: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly maxRank: number;
  readonly requiredTalentId: string | null;
  readonly requiredTalentRank: number;
  readonly requiredLevel: number;
  readonly row: number;
  readonly col: number;
  readonly effects: TalentRankEffect[];
};

/**
 * Presentation-only talent info sent to the client.
 * Currently identical to TalentDef — kept as a separate type for forward
 * compatibility when server-only fields are added (e.g. internal balancing flags).
 */
export type TalentDefClient = Omit<TalentDef, never>;

/** Strip server-only fields from a TalentDef for client consumption */
export function toTalentDefClient(def: TalentDef): TalentDefClient {
  return { ...def };
}
