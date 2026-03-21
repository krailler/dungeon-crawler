import type { PlayerState } from "../state/PlayerState.js";
import { ActiveEffectState } from "../state/ActiveEffectState.js";
import { getEffectDef } from "../effects/EffectRegistry.js";
import { collectTalentStatMods } from "../talents/TalentRegistry.js";
import { getInstance as getItemInstance } from "../items/ItemInstanceRegistry.js";
import { computeDerivedStats, StackBehavior, StatModType, lerpEffectValue } from "@dungeon/shared";
import type { StatModifier, EffectScaling, TickEffect } from "@dungeon/shared";

/**
 * Manages active effects (buffs/debuffs) on players.
 *
 * Lifecycle:
 *   applyEffect()  ──▶  update() ticks remaining  ──▶  effect expires → recomputeStats()
 *       │                    │                                or
 *       │                    │                         clearEffects() on death/respawn
 *       │                    ▼
 *       │               tickEffect? (HoT/DoT)
 *       │               ┌────────────────────────────────┐
 *       │               │ accumulate dt per effect       │
 *       │               │ when accum ≥ interval:         │
 *       │               │   applyTickEffect(type, value) │
 *       │               │   (heal → restore HP)          │
 *       │               └────────────────────────────────┘
 *       ▼
 *   New effect:         Re-application:
 *   ┌──────────┐        ┌────────────────────────────────────┐
 *   │ create   │        │ REFRESH: reset timer               │
 *   │ state +  │        │ INTENSITY: add stacks (up to max)  │
 *   │ set on   │        │                                    │
 *   │ player   │        │ If new scalingFactor > existing:   │
 *   └──────────┘        │   upgrade factor + recalc values   │
 *       │               └────────────────────────────────────┘
 *       ▼
 *   recomputeStats()
 *   ┌─────────────────────────────────────────────────────┐
 *   │ 1. Collect equipment base bonuses (str/vit/agi)     │
 *   │ 2. computeDerivedStats(base + equip, classScaling)  │
 *   │ 3. Equipment derived mods (flat: HP, ATK, DEF...)   │
 *   │ 4. Aggregate talent passive stat modifiers          │
 *   │ 5. For each active effect:                         │
 *   │    └─ lerp modifier with stored scalingFactor      │
 *   │    └─ multiply by stacks if INTENSITY              │
 *   │ 6. Apply: stat = (base + flat) * (1 + percent)     │
 *   │ 7. Clamp minimums (health≥1, attack≥0, etc.)      │
 *   └─────────────────────────────────────────────────────┘
 */
export class EffectSystem {
  /**
   * Apply an effect to a player (or refresh/stack if already present).
   *
   * Scaling resolution: scalingOverride > def.scaling > null
   *
   * @param scalingFactor 0–1 based on dungeon level vs creature_effect level range
   * @param scalingOverride if set, overrides the effect's default scaling config
   */
  applyEffect(
    player: PlayerState,
    effectId: string,
    stacks: number = 1,
    scalingFactor: number = 0,
    scalingOverride?: EffectScaling | null,
  ): void {
    const def = getEffectDef(effectId);
    if (!def) return;

    const effectiveScaling = scalingOverride ?? def.scaling ?? null;
    const scaledDuration = lerpEffectValue(def.duration, effectiveScaling?.duration, scalingFactor);
    const modValue = this.computeModValue(def, effectiveScaling, scalingFactor);

    const existing = player.effects.get(effectId);
    if (existing) {
      // Upgrade scaling if new application is stronger
      if (scalingFactor > existing.scalingFactor) {
        existing.scalingFactor = scalingFactor;
        existing.scalingOverride = scalingOverride ?? null;
      }
      // Recalculate duration and modValue with the (possibly upgraded) factor
      const bestScaling = existing.scalingOverride ?? def.scaling ?? null;
      const bestDuration = lerpEffectValue(
        def.duration,
        bestScaling?.duration,
        existing.scalingFactor,
      );
      existing.duration = bestDuration;
      existing.modValue = this.computeModValue(def, bestScaling, existing.scalingFactor);

      if (def.stackBehavior === StackBehavior.REFRESH) {
        existing.remaining = bestDuration;
      } else {
        // INTENSITY: add stacks up to max, reset timer
        existing.stacks = Math.min(existing.stacks + stacks, def.maxStacks);
        existing.remaining = bestDuration;
      }
    } else {
      const state = new ActiveEffectState();
      state.effectId = effectId;
      state.duration = scaledDuration;
      state.remaining = scaledDuration;
      state.stacks = Math.min(stacks, def.maxStacks);
      state.modValue = modValue;
      state.scalingFactor = scalingFactor;
      state.scalingOverride = scalingOverride ?? null;
      player.effects.set(effectId, state);
    }

    this.recomputeStats(player);
  }

  /**
   * Compute the primary modifier display value (absolute, clamped to int8).
   * For stat modifiers: percentage (e.g. -25% → 25).
   * For tick effects with no stat modifiers: tick value (e.g. 8 HP/tick → 8).
   */
  private computeModValue(
    def: {
      statModifiers: Record<string, StatModifier>;
      tickEffect: TickEffect | null;
      scaling: EffectScaling | null;
    },
    effectiveScaling: EffectScaling | null,
    t: number,
  ): number {
    const firstMod = Object.entries(def.statModifiers)[0];
    if (firstMod) {
      const [statKey, mod] = firstMod;
      const scaledValue = lerpEffectValue(
        mod.value,
        effectiveScaling?.statModifiers?.[statKey]?.value,
        t,
      );
      // Clamp to int8 range (0–127) for Colyseus @type("int8")
      return Math.min(127, Math.round(Math.abs(scaledValue * 100)));
    }
    // Fallback: use tick effect value for display (e.g. 8 HP/tick)
    if (def.tickEffect) {
      const scaledTick = lerpEffectValue(
        def.tickEffect.value,
        effectiveScaling?.tickEffect?.value,
        t,
      );
      return Math.min(127, Math.round(Math.abs(scaledTick)));
    }
    return 0;
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
          return;
        }

        // Process tick effects (heal/damage over time)
        const def = getEffectDef(effectId);
        if (def?.tickEffect) {
          effect.tickAccum += dt;
          const scaling = effect.scalingOverride ?? def.scaling ?? null;
          const scaledValue = lerpEffectValue(
            def.tickEffect.value,
            scaling?.tickEffect?.value,
            effect.scalingFactor,
          );
          while (effect.tickAccum >= def.tickEffect.interval) {
            effect.tickAccum -= def.tickEffect.interval;
            this.applyTickEffect(player, def.tickEffect.type, scaledValue);
          }
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
   * Apply a single tick of a periodic effect (heal, damage, etc.)
   */
  private applyTickEffect(player: PlayerState, type: string, value: number): void {
    switch (type) {
      case "heal": {
        const amount = Math.round(value);
        if (amount > 0 && player.health < player.maxHealth) {
          player.health = Math.min(player.health + amount, player.maxHealth);
        }
        break;
      }
    }
  }

  /**
   * Recompute player derived stats, applying all active effect modifiers.
   */
  recomputeStats(player: PlayerState): void {
    // Collect equipment base stat bonuses (str/vit/agi) — applied before class scaling
    let equipStr = 0;
    let equipVit = 0;
    let equipAgi = 0;
    const equipDerivedMods: Record<string, number> = {};

    player.equipment.forEach((eqSlot) => {
      if (!eqSlot.instanceId) return;
      const instance = getItemInstance(eqSlot.instanceId);
      if (!instance?.rolledStats) return;
      for (const [stat, value] of Object.entries(instance.rolledStats)) {
        if (stat === "strength") equipStr += value;
        else if (stat === "vitality") equipVit += value;
        else if (stat === "agility") equipAgi += value;
        else equipDerivedMods[stat] = (equipDerivedMods[stat] ?? 0) + value;
      }
    });

    // Start from base stats + equipment base bonuses (using per-class scaling)
    const derived = computeDerivedStats(
      {
        strength: player.strength + equipStr,
        vitality: player.vitality + equipVit,
        agility: player.agility + equipAgi,
      },
      player.statScaling,
    );

    // Aggregate all modifiers from active effects + talents + equipment derived
    const flatMods: Record<string, number> = { ...equipDerivedMods };
    const percentMods: Record<string, number> = {};

    // Talent passive stat modifiers
    for (const mod of collectTalentStatMods(player.talentAllocations)) {
      if (mod.type === StatModType.FLAT) {
        flatMods[mod.stat] = (flatMods[mod.stat] ?? 0) + mod.value;
      } else if (mod.type === StatModType.PERCENT) {
        percentMods[mod.stat] = (percentMods[mod.stat] ?? 0) + mod.value;
      }
    }

    player.effects.forEach((effect: ActiveEffectState) => {
      const def = getEffectDef(effect.effectId);
      if (!def) return;

      const multiplier = def.stackBehavior === StackBehavior.INTENSITY ? effect.stacks : 1;
      const scaling = effect.scalingOverride ?? def.scaling ?? null;

      for (const [stat, mod] of Object.entries(def.statModifiers) as [string, StatModifier][]) {
        const scaledValue = lerpEffectValue(
          mod.value,
          scaling?.statModifiers?.[stat]?.value,
          effect.scalingFactor,
        );
        if (mod.type === StatModType.FLAT) {
          flatMods[stat] = (flatMods[stat] ?? 0) + scaledValue * multiplier;
        } else if (mod.type === StatModType.PERCENT) {
          percentMods[stat] = (percentMods[stat] ?? 0) + scaledValue * multiplier;
        }
      }
    });

    // Apply: stat = (base + flatSum) * (1 + percentSum)
    const applyMods = (base: number, stat: string): number => {
      const flat = flatMods[stat] ?? 0;
      const percent = percentMods[stat] ?? 0;
      return (base + flat) * (1 + percent);
    };

    // Integer stats (round)
    player.maxHealth = Math.max(1, Math.round(applyMods(derived.maxHealth, "maxHealth")));
    player.attackDamage = Math.max(0, Math.round(applyMods(derived.attackDamage, "attackDamage")));
    player.defense = Math.max(0, Math.round(applyMods(derived.defense, "defense")));
    // Float stats (keep precision)
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
