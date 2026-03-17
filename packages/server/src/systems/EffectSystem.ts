import type { PlayerState } from "../state/PlayerState.js";
import { ActiveEffectState } from "../state/ActiveEffectState.js";
import { getEffectDef } from "../effects/EffectRegistry.js";
import { computeDerivedStats, StackBehavior, StatModType } from "@dungeon/shared";
import type { StatModifier } from "@dungeon/shared";

export class EffectSystem {
  /**
   * Apply an effect to a player (or refresh/stack if already present).
   */
  applyEffect(player: PlayerState, effectId: string, stacks: number = 1): void {
    const def = getEffectDef(effectId);
    if (!def) return;

    const existing = player.effects.get(effectId);
    if (existing) {
      if (def.stackBehavior === StackBehavior.REFRESH) {
        // Reset timer only
        existing.remaining = def.duration;
      } else {
        // INTENSITY: add stacks up to max, reset timer
        existing.stacks = Math.min(existing.stacks + stacks, def.maxStacks) as number;
        existing.remaining = def.duration;
      }
    } else {
      const state = new ActiveEffectState();
      state.effectId = effectId;
      state.duration = def.duration;
      state.remaining = def.duration;
      state.stacks = Math.min(stacks, def.maxStacks) as number;
      player.effects.set(effectId, state);
    }

    this.recomputeStats(player);
  }

  /**
   * Tick all active effects for all players. Call once per game tick.
   */
  update(dt: number, players: Map<string, PlayerState>): void {
    for (const [, player] of players) {
      if (player.effects.size === 0) continue;

      let dirty = false;
      const toRemove: string[] = [];

      player.effects.forEach((effect: ActiveEffectState, effectId: string) => {
        effect.remaining -= dt;
        if (effect.remaining <= 0) {
          toRemove.push(effectId);
          dirty = true;
        }
      });

      for (const id of toRemove) {
        player.effects.delete(id);
      }

      if (dirty) {
        this.recomputeStats(player);
      }
    }
  }

  /**
   * Recompute player derived stats, applying all active effect modifiers.
   */
  recomputeStats(player: PlayerState): void {
    // Start from clean base stats
    const derived = computeDerivedStats({
      strength: player.strength,
      vitality: player.vitality,
      agility: player.agility,
    });

    // Aggregate all modifiers from active effects
    const flatMods: Record<string, number> = {};
    const percentMods: Record<string, number> = {};

    player.effects.forEach((effect: ActiveEffectState) => {
      const def = getEffectDef(effect.effectId);
      if (!def) return;

      const multiplier = def.stackBehavior === StackBehavior.INTENSITY ? effect.stacks : 1;

      for (const [stat, mod] of Object.entries(def.statModifiers) as [string, StatModifier][]) {
        if (mod.type === StatModType.FLAT) {
          flatMods[stat] = (flatMods[stat] ?? 0) + mod.value * multiplier;
        } else if (mod.type === StatModType.PERCENT) {
          percentMods[stat] = (percentMods[stat] ?? 0) + mod.value * multiplier;
        }
      }
    });

    // Apply: stat = (base + flatSum) * (1 + percentSum)
    const applyMods = (base: number, stat: string): number => {
      const flat = flatMods[stat] ?? 0;
      const percent = percentMods[stat] ?? 0;
      return Math.round((base + flat) * (1 + percent));
    };

    player.maxHealth = Math.max(1, applyMods(derived.maxHealth, "maxHealth"));
    player.attackDamage = Math.max(0, applyMods(derived.attackDamage, "attackDamage"));
    player.defense = Math.max(0, applyMods(derived.defense, "defense"));
    player.speed = Math.max(0.5, applyMods(derived.moveSpeed, "moveSpeed"));
    player.attackCooldown = Math.max(0.3, applyMods(derived.attackCooldown, "attackCooldown"));
    player.attackRange = derived.attackRange;

    // Clamp health if maxHealth decreased
    if (player.health > player.maxHealth) {
      player.health = player.maxHealth;
    }
  }

  /**
   * Remove all active effects from a player and recompute stats.
   */
  clearEffects(player: PlayerState): void {
    if (player.effects.size === 0) return;
    player.effects.clear();
    this.recomputeStats(player);
  }

  /**
   * Remove a specific effect from a player and recompute stats.
   */
  removeEffect(player: PlayerState, effectId: string): void {
    if (!player.effects.has(effectId)) return;
    player.effects.delete(effectId);
    this.recomputeStats(player);
  }
}
