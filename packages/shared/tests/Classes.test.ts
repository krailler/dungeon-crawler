import { describe, it, expect } from "bun:test";
import { toClassDefClient } from "../src/Classes.js";
import type { ClassDef, ClassSkillEntry } from "../src/Classes.js";

const baseDef: ClassDef = {
  id: "warrior",
  name: "Warrior",
  description: "A mighty fighter",
  icon: "warrior_icon",
  scaling: {
    healthBase: 50,
    healthPerVit: 5,
    attackBase: 5,
    attackPerStr: 0.5,
    defenseBase: 0,
    defensePerVit: 0.3,
    speedBase: 4,
    speedPerAgi: 0.1,
    cooldownBase: 1.2,
    cooldownPerAgi: 0.02,
    attackRange: 2.5,
  },
  skillIds: ["basic_attack", "heavy_strike"],
};

describe("toClassDefClient", () => {
  it("returns client fields with empty skills when no skillEntries provided", () => {
    const client = toClassDefClient(baseDef);
    expect(client.id).toBe("warrior");
    expect(client.name).toBe("Warrior");
    expect(client.description).toBe("A mighty fighter");
    expect(client.icon).toBe("warrior_icon");
    expect(client.skills).toEqual([]);
  });

  it("strips server-only fields (scaling, skillIds)", () => {
    const client = toClassDefClient(baseDef) as Record<string, unknown>;
    expect(client.scaling).toBeUndefined();
    expect(client.skillIds).toBeUndefined();
  });

  it("includes skillEntries when provided", () => {
    const entries: ClassSkillEntry[] = [
      { skillId: "basic_attack", unlockLevel: 1, isDefault: true },
      { skillId: "heavy_strike", unlockLevel: 3, isDefault: false },
    ];
    const client = toClassDefClient(baseDef, entries);
    expect(client.skills).toHaveLength(2);
    expect(client.skills[0].skillId).toBe("basic_attack");
    expect(client.skills[1].unlockLevel).toBe(3);
  });
});
