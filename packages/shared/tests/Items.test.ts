import { describe, it, expect } from "bun:test";
import { toItemDefClient } from "../src/Items.js";
import type { ItemDef } from "../src/Items.js";

describe("toItemDefClient", () => {
  const fullDef: ItemDef = {
    id: "health_potion",
    name: "Health Potion",
    description: "Restores health",
    icon: "potion_red",
    maxStack: 5,
    consumable: true,
    cooldown: 10,
    effectType: "heal",
    effectParams: { amount: 50 },
    useSound: "potion_use",
    transient: false,
    rarity: "common",
    equipSlot: null,
    levelReq: 0,
    statRanges: {},
    bonusPool: [{ stat: "vitality", min: 1, max: 3, weight: 5 }],
  };

  it("keeps client-facing fields", () => {
    const client = toItemDefClient(fullDef);
    expect(client.id).toBe("health_potion");
    expect(client.name).toBe("Health Potion");
    expect(client.description).toBe("Restores health");
    expect(client.icon).toBe("potion_red");
    expect(client.consumable).toBe(true);
    expect(client.effectParams).toEqual({ amount: 50 });
    expect(client.transient).toBe(false);
    expect(client.rarity).toBe("common");
    expect(client.equipSlot).toBeNull();
    expect(client.levelReq).toBe(0);
    expect(client.statRanges).toEqual({});
  });

  it("strips server-only fields", () => {
    const client = toItemDefClient(fullDef) as Record<string, unknown>;
    expect(client.maxStack).toBeUndefined();
    expect(client.cooldown).toBeUndefined();
    expect(client.effectType).toBeUndefined();
    expect(client.useSound).toBeUndefined();
    expect(client.bonusPool).toBeUndefined();
  });

  it("works for an equippable item with statRanges", () => {
    const equipDef: ItemDef = {
      ...fullDef,
      id: "iron_sword",
      consumable: false,
      rarity: "uncommon",
      equipSlot: "weapon",
      levelReq: 5,
      statRanges: { attackDamage: { min: 5, max: 15 } },
    };
    const client = toItemDefClient(equipDef);
    expect(client.equipSlot).toBe("weapon");
    expect(client.levelReq).toBe(5);
    expect(client.statRanges).toEqual({ attackDamage: { min: 5, max: 15 } });
  });
});
