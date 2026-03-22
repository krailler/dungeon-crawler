import { describe, it, expect, beforeEach, mock } from "bun:test";
import { executeEffect } from "../src/items/EffectHandlers.js";
import { ItemEffectType } from "@dungeon/shared";

describe("EffectHandlers", () => {
  // ── HEAL handler ──────────────────────────────────────────────────────────

  describe("HEAL", () => {
    let player: { health: number; maxHealth: number };

    beforeEach(() => {
      player = { health: 50, maxHealth: 100 };
    });

    it("heals the player by the given amount", () => {
      const result = executeEffect(ItemEffectType.HEAL, player as any, { amount: 20 });
      expect(result).toBe(true);
      expect(player.health).toBe(70);
    });

    it("caps healing at maxHealth", () => {
      player.health = 90;
      const result = executeEffect(ItemEffectType.HEAL, player as any, { amount: 50 });
      expect(result).toBe(true);
      expect(player.health).toBe(100);
    });

    it("returns false when player is already at full health", () => {
      player.health = 100;
      const result = executeEffect(ItemEffectType.HEAL, player as any, { amount: 20 });
      expect(result).toBe(false);
      expect(player.health).toBe(100);
    });

    it("returns false when amount is zero", () => {
      const result = executeEffect(ItemEffectType.HEAL, player as any, { amount: 0 });
      expect(result).toBe(false);
      expect(player.health).toBe(50);
    });

    it("returns false when amount is negative", () => {
      const result = executeEffect(ItemEffectType.HEAL, player as any, { amount: -10 });
      expect(result).toBe(false);
      expect(player.health).toBe(50);
    });

    it("treats missing amount as 0", () => {
      const result = executeEffect(ItemEffectType.HEAL, player as any, {});
      expect(result).toBe(false);
    });
  });

  // ── APPLY_EFFECT handler ──────────────────────────────────────────────────

  describe("APPLY_EFFECT", () => {
    it("calls effectSystem.applyEffect with correct args", () => {
      const player = { health: 50, maxHealth: 100 } as any;
      const effectSystem = { applyEffect: mock(() => {}) } as any;

      const result = executeEffect(
        ItemEffectType.APPLY_EFFECT,
        player,
        { effectId: "regeneration" },
        effectSystem,
      );
      expect(result).toBe(true);
      expect(effectSystem.applyEffect).toHaveBeenCalledWith(player, "regeneration");
    });

    it("returns false when effectId is missing", () => {
      const player = { health: 50, maxHealth: 100 } as any;
      const effectSystem = { applyEffect: mock(() => {}) } as any;

      const result = executeEffect(ItemEffectType.APPLY_EFFECT, player, {}, effectSystem);
      expect(result).toBe(false);
      expect(effectSystem.applyEffect).not.toHaveBeenCalled();
    });

    it("returns false when effectSystem is not provided", () => {
      const player = { health: 50, maxHealth: 100 } as any;

      const result = executeEffect(ItemEffectType.APPLY_EFFECT, player, {
        effectId: "regeneration",
      });
      expect(result).toBe(false);
    });
  });

  // ── Unknown effect type ───────────────────────────────────────────────────

  describe("unknown effect type", () => {
    it("returns false for unregistered effect type", () => {
      const player = { health: 50, maxHealth: 100 } as any;
      const result = executeEffect("unknown_type" as any, player, {});
      expect(result).toBe(false);
    });
  });
});
