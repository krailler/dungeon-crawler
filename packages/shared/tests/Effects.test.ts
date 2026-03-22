import { describe, it, expect } from "bun:test";
import { lerpEffectValue, computeScalingFactor, toEffectDefClient } from "../src/Effects.js";
import type { EffectDef } from "../src/Effects.js";
import { StackBehavior } from "../src/Effects.js";

describe("lerpEffectValue", () => {
  it("t=0 returns base", () => {
    expect(lerpEffectValue(5, 10, 0)).toBe(5);
  });

  it("t=1 returns max", () => {
    expect(lerpEffectValue(5, 10, 1)).toBe(10);
  });

  it("t=0.5 returns midpoint", () => {
    expect(lerpEffectValue(5, 10, 0.5)).toBeCloseTo(7.5, 5);
  });

  it("max=undefined returns base regardless of t", () => {
    expect(lerpEffectValue(5, undefined, 0.8)).toBe(5);
  });

  it("t<0 returns base (clamped)", () => {
    expect(lerpEffectValue(5, 10, -1)).toBe(5);
  });

  it("t>1 is clamped to 1", () => {
    expect(lerpEffectValue(5, 10, 2)).toBe(10);
  });
});

describe("computeScalingFactor", () => {
  it("at minLevel returns 0", () => {
    expect(computeScalingFactor(5, 5, 30, 30)).toBe(0);
  });

  it("at maxLevel returns 1", () => {
    expect(computeScalingFactor(30, 5, 30, 30)).toBe(1);
  });

  it("interpolates between min and max", () => {
    // (15 - 5) / (30 - 5) = 10/25 = 0.4
    expect(computeScalingFactor(15, 5, 30, 30)).toBeCloseTo(0.4, 5);
  });

  it("maxLevel=0 uses levelCap", () => {
    // maxLevel=0 -> uses levelCap=30, so (15 - 1) / (30 - 1) = 14/29
    expect(computeScalingFactor(15, 1, 0, 30)).toBeCloseTo(14 / 29, 5);
  });

  it("below minLevel is clamped to 0", () => {
    expect(computeScalingFactor(1, 5, 30, 30)).toBe(0);
  });

  it("above maxLevel is clamped to 1", () => {
    expect(computeScalingFactor(50, 5, 30, 30)).toBe(1);
  });
});

describe("toEffectDefClient", () => {
  const baseEffectDef: EffectDef = {
    id: "weakness",
    name: "effect.weakness",
    description: "effect.weakness_desc",
    icon: "weakness",
    duration: 5,
    maxStacks: 1,
    stackBehavior: StackBehavior.REFRESH,
    isDebuff: true,
    statModifiers: { attackDamage: { type: "percent" as const, value: -0.25 } },
    tickEffect: null,
    scaling: null,
  };

  it("strips server-only fields and keeps client fields", () => {
    const client = toEffectDefClient(baseEffectDef);
    expect(client.id).toBe("weakness");
    expect(client.name).toBe("effect.weakness");
    expect(client.description).toBe("effect.weakness_desc");
    expect(client.icon).toBe("weakness");
    expect(client.isDebuff).toBe(true);
    // Should NOT have server-only fields
    expect((client as any).duration).toBeUndefined();
    expect((client as any).maxStacks).toBeUndefined();
    expect((client as any).stackBehavior).toBeUndefined();
    expect((client as any).statModifiers).toBeUndefined();
    expect((client as any).scaling).toBeUndefined();
  });

  it("returns tickInterval from tickEffect.interval", () => {
    const defWithTick: EffectDef = {
      ...baseEffectDef,
      tickEffect: { type: "heal", value: 8, interval: 2 },
    };
    const client = toEffectDefClient(defWithTick);
    expect(client.tickInterval).toBe(2);
  });

  it("returns null tickInterval when no tickEffect", () => {
    const client = toEffectDefClient(baseEffectDef);
    expect(client.tickInterval).toBeNull();
  });
});
