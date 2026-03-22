import { describe, it, expect } from "bun:test";
import { rollStatValue, selectFromPool, rollEquipmentDrop } from "../src/items/LootRoller.js";
import type { BonusPoolEntry, ItemDef } from "@dungeon/shared";

describe("rollStatValue", () => {
  it("returns a value within [min, max] when ilvlFactor is 1", () => {
    for (let i = 0; i < 100; i++) {
      const val = rollStatValue(5, 20, 1);
      expect(val).toBeGreaterThanOrEqual(5);
      expect(val).toBeLessThanOrEqual(20);
    }
  });

  it("returns a value in a narrower range when ilvlFactor is 0.5", () => {
    // At ilvlFactor=0.5, effectiveRange = range * (0.5 + 0.5*0.5) = range * 0.75
    // So max possible = min + 0.75 * range
    const min = 10;
    const max = 30;
    const range = max - min; // 20
    const effectiveMax = min + range * 0.75; // 25

    for (let i = 0; i < 100; i++) {
      const val = rollStatValue(min, max, 0.5);
      expect(val).toBeGreaterThanOrEqual(min);
      expect(val).toBeLessThanOrEqual(effectiveMax + 0.001); // small float tolerance
    }
  });

  it("biases toward higher values over many rolls", () => {
    const min = 0;
    const max = 100;
    let sum = 0;
    const N = 5000;
    for (let i = 0; i < N; i++) {
      sum += rollStatValue(min, max, 1);
    }
    const avg = sum / N;
    // With random()^0.8 bias, average should be above the midpoint (50)
    // E[x^0.8] for uniform x in [0,1] = 1/1.8 ≈ 0.556
    expect(avg).toBeGreaterThan(50);
  });

  it("returns min when min equals max", () => {
    const val = rollStatValue(10, 10, 1);
    expect(val).toBe(10);
  });
});

describe("selectFromPool", () => {
  const pool: BonusPoolEntry[] = [
    { stat: "strength", min: 1, max: 5, weight: 3 },
    { stat: "vitality", min: 2, max: 8, weight: 5 },
    { stat: "agility", min: 1, max: 3, weight: 2 },
  ];

  it("selects the correct count of entries", () => {
    const result = selectFromPool(pool, 2);
    expect(result).toHaveLength(2);
  });

  it("selects no duplicates", () => {
    const result = selectFromPool(pool, 3);
    const stats = result.map((e) => e.stat);
    const unique = new Set(stats);
    expect(unique.size).toBe(stats.length);
  });

  it("returns empty array when count is 0", () => {
    expect(selectFromPool(pool, 0)).toEqual([]);
  });

  it("returns empty array when pool is empty", () => {
    expect(selectFromPool([], 3)).toEqual([]);
  });

  it("clamps to pool size when count exceeds pool length", () => {
    const result = selectFromPool(pool, 10);
    expect(result).toHaveLength(3);
  });

  it("respects weighted selection over many trials", () => {
    // With weights 3, 5, 2 and selecting 1 each time,
    // vitality (weight 5) should be picked most often
    const counts: Record<string, number> = { strength: 0, vitality: 0, agility: 0 };
    const N = 3000;
    for (let i = 0; i < N; i++) {
      const [entry] = selectFromPool(pool, 1);
      counts[entry.stat]++;
    }
    // vitality (weight 5/10 = 50%) should be most frequent
    expect(counts.vitality).toBeGreaterThan(counts.strength);
    expect(counts.vitality).toBeGreaterThan(counts.agility);
  });
});

describe("rollEquipmentDrop", () => {
  const baseDef: ItemDef = {
    id: "test_sword",
    name: "Test Sword",
    description: "A test weapon",
    icon: "sword",
    maxStack: 1,
    consumable: false,
    cooldown: 0,
    effectType: "none",
    effectParams: {},
    useSound: "",
    transient: false,
    rarity: "common",
    equipSlot: "weapon",
    levelReq: 1,
    statRanges: {
      attackDamage: { min: 5, max: 15 },
    },
    bonusPool: [],
  };

  it("returns an ItemInstance with correct itemId and itemLevel", () => {
    const inst = rollEquipmentDrop(baseDef, 10);
    expect(inst.itemId).toBe("test_sword");
    expect(inst.itemLevel).toBe(10);
    expect(inst.id).toBeTruthy();
  });

  it("rolls stats within the defined ranges", () => {
    for (let i = 0; i < 50; i++) {
      const inst = rollEquipmentDrop(baseDef, 30);
      // At max level, full range is available
      expect(inst.rolledStats.attackDamage).toBeGreaterThanOrEqual(5);
      expect(inst.rolledStats.attackDamage).toBeLessThanOrEqual(15);
    }
  });

  it("rounds integer stats to whole numbers", () => {
    for (let i = 0; i < 20; i++) {
      const inst = rollEquipmentDrop(baseDef, 15);
      expect(Number.isInteger(inst.rolledStats.attackDamage)).toBe(true);
    }
  });

  it("integer stats are at least 1", () => {
    const lowDef: ItemDef = {
      ...baseDef,
      statRanges: { attackDamage: { min: 0, max: 1 } },
    };
    for (let i = 0; i < 30; i++) {
      const inst = rollEquipmentDrop(lowDef, 1);
      expect(inst.rolledStats.attackDamage).toBeGreaterThanOrEqual(1);
    }
  });

  it("adds bonus affixes for uncommon rarity", () => {
    const uncommonDef: ItemDef = {
      ...baseDef,
      rarity: "uncommon",
      bonusPool: [
        { stat: "strength", min: 1, max: 5, weight: 5 },
        { stat: "vitality", min: 1, max: 5, weight: 5 },
      ],
    };
    // Uncommon gets exactly 1 bonus affix
    const inst = rollEquipmentDrop(uncommonDef, 15);
    // Should have attackDamage (guaranteed) + 1 bonus stat
    const keys = Object.keys(inst.rolledStats);
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it("common rarity gets no bonus affixes", () => {
    const commonDef: ItemDef = {
      ...baseDef,
      rarity: "common",
      bonusPool: [{ stat: "strength", min: 1, max: 5, weight: 5 }],
    };
    const inst = rollEquipmentDrop(commonDef, 15);
    // Only guaranteed stats, no bonuses
    expect(Object.keys(inst.rolledStats)).toEqual(["attackDamage"]);
  });

  it("uses rarity override parameter when provided", () => {
    const defWithPool: ItemDef = {
      ...baseDef,
      rarity: "common", // template is common
      bonusPool: [
        { stat: "strength", min: 1, max: 5, weight: 5 },
        { stat: "vitality", min: 1, max: 5, weight: 5 },
      ],
    };
    // Override to uncommon — should add bonus affixes
    const inst = rollEquipmentDrop(defWithPool, 15, "uncommon");
    const keys = Object.keys(inst.rolledStats);
    expect(keys.length).toBeGreaterThanOrEqual(2);
  });

  it("generates a unique id for each instance", () => {
    const a = rollEquipmentDrop(baseDef, 10);
    const b = rollEquipmentDrop(baseDef, 10);
    expect(a.id).not.toBe(b.id);
  });

  it("keeps float stats at 2 decimal precision (non-integer stats)", () => {
    const floatDef: ItemDef = {
      ...baseDef,
      statRanges: {
        moveSpeed: { min: 0.5, max: 2.0 },
      },
    };
    for (let i = 0; i < 50; i++) {
      const inst = rollEquipmentDrop(floatDef, 15);
      const val = inst.rolledStats.moveSpeed;
      // Value should have at most 2 decimal places
      const rounded = Math.round(val * 100) / 100;
      expect(val).toBe(rounded);
      // moveSpeed is NOT in INTEGER_STATS, so it should NOT be rounded to integer
      // (it can be a non-integer value)
    }
  });
});
