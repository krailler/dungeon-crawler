import { describe, it, expect } from "bun:test";
import { computeTalentSkillMods, TalentEffectType } from "../src/Talents.js";
import type { TalentDef } from "../src/Talents.js";

function makeTalentDef(
  overrides: Partial<TalentDef> & Pick<TalentDef, "id" | "effects">,
): TalentDef {
  return {
    classId: "warrior",
    name: "Test Talent",
    description: "",
    icon: "test",
    maxRank: 3,
    requiredTalentId: null,
    requiredTalentRank: 0,
    requiredLevel: 1,
    row: 0,
    col: 0,
    ...overrides,
  };
}

describe("computeTalentSkillMods", () => {
  it("empty allocations returns identity multipliers", () => {
    const result = computeTalentSkillMods([], new Map(), "heavy_strike");
    expect(result.cooldownMul).toBe(1);
    expect(result.damageMul).toBe(1);
  });

  it("single talent with cooldown mod", () => {
    const talent = makeTalentDef({
      id: "t1",
      effects: [
        {
          rank: 1,
          effectType: TalentEffectType.MODIFY_SKILL,
          skillModifier: { skillId: "heavy_strike", cooldownMul: 0.9 },
        },
      ],
    });
    const allocs = new Map([["t1", 1]]);
    const result = computeTalentSkillMods([talent], allocs, "heavy_strike");
    expect(result.cooldownMul).toBeCloseTo(0.9, 5);
    expect(result.damageMul).toBe(1);
  });

  it("talent for different skill is ignored", () => {
    const talent = makeTalentDef({
      id: "t2",
      effects: [
        {
          rank: 1,
          effectType: TalentEffectType.MODIFY_SKILL,
          skillModifier: { skillId: "execute", damageMul: 1.5 },
        },
      ],
    });
    const allocs = new Map([["t2", 1]]);
    const result = computeTalentSkillMods([talent], allocs, "heavy_strike");
    expect(result.cooldownMul).toBe(1);
    expect(result.damageMul).toBe(1);
  });

  it("effect rank higher than allocation is skipped", () => {
    const talent = makeTalentDef({
      id: "t3",
      effects: [
        {
          rank: 3,
          effectType: TalentEffectType.MODIFY_SKILL,
          skillModifier: { skillId: "heavy_strike", damageMul: 2.0 },
        },
      ],
    });
    const allocs = new Map([["t3", 2]]);
    const result = computeTalentSkillMods([talent], allocs, "heavy_strike");
    expect(result.damageMul).toBe(1);
  });

  it("multiple ranks stack multiplicatively", () => {
    const talent = makeTalentDef({
      id: "t4",
      effects: [
        {
          rank: 1,
          effectType: TalentEffectType.MODIFY_SKILL,
          skillModifier: { skillId: "heavy_strike", damageMul: 1.1 },
        },
        {
          rank: 2,
          effectType: TalentEffectType.MODIFY_SKILL,
          skillModifier: { skillId: "heavy_strike", damageMul: 1.1 },
        },
      ],
    });
    const allocs = new Map([["t4", 2]]);
    const result = computeTalentSkillMods([talent], allocs, "heavy_strike");
    expect(result.damageMul).toBeCloseTo(1.1 * 1.1, 5);
  });
});

describe("toTalentDefClient", () => {
  // Import here to keep it co-located with the test
  const { toTalentDefClient } = require("../src/Talents.js");

  it("returns a shallow copy of the TalentDef", () => {
    const def: TalentDef = makeTalentDef({
      id: "talent_test",
      effects: [
        {
          rank: 1,
          effectType: TalentEffectType.STAT_MOD,
          statModifier: { stat: "maxHealth", type: "percent" as any, value: 0.1 },
        },
      ],
    });

    const client = toTalentDefClient(def);

    expect(client.id).toBe("talent_test");
    expect(client.classId).toBe("warrior");
    expect(client.name).toBe("Test Talent");
    expect(client.description).toBe("");
    expect(client.icon).toBe("test");
    expect(client.maxRank).toBe(3);
    expect(client.requiredTalentId).toBeNull();
    expect(client.requiredTalentRank).toBe(0);
    expect(client.requiredLevel).toBe(1);
    expect(client.row).toBe(0);
    expect(client.col).toBe(0);
    expect(client.effects).toHaveLength(1);
    expect(client.effects[0].rank).toBe(1);
  });

  it("is a distinct object (not the same reference)", () => {
    const def: TalentDef = makeTalentDef({ id: "ref_check", effects: [] });
    const client = toTalentDefClient(def);
    expect(client).not.toBe(def);
    expect(client).toEqual(def);
  });
});
