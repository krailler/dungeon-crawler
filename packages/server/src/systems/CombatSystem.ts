/**
 * Player Combat — Auto-attack + active skills against creatures.
 *
 * Per-tick pipeline (update()):
 *
 *   For each registered player:
 *   ┌──────────────────────────────────────────────────────┐
 *   │ 1. Tick down skill cooldowns                        │
 *   │ 2. Tick anim timer → clear animState when done      │
 *   │ 3. Tick damage timer → apply damage at animation    │
 *   │    peak (DAMAGE_DELAY) and fire onHit callback      │
 *   │ 4. If attack cooldown ready + auto-attack enabled:  │
 *   │    └─ findTarget() → scheduleHit()                  │
 *   └──────────────────────────────────────────────────────┘
 *
 * Target selection (findTarget):
 *   1. Prefer player's manually-selected target (click/tab) if alive + in range
 *   2. Fallback: closest alive creature within attackRange
 *
 * Active skills (useSkill) — three paths:
 *   1. Buff: effectId + no damage → self-buff, no enemy target needed
 *   2. AoE: aoeRange > 0 → area damage (applied in DungeonRoom handler)
 *   3. Single-target: needs enemy target, optional hpThreshold check
 *   - Applies talent modifiers (cooldownMul, damageMul)
 *   - resetOnKill: cooldown deleted if target dies from hit
 *   - Returns SkillCooldownEvent for client feedback
 *
 * Damage timing (same as AISystem):
 *   scheduleHit() → face target + play anim → damage at DAMAGE_DELAY
 */
import type { PlayerState } from "../state/PlayerState";
import type { CreatureState } from "../state/CreatureState";
import {
  ATTACK_ANIM_DURATION,
  DAMAGE_DELAY,
  computeDamage,
  LifeState,
  angleBetween,
} from "@dungeon/shared";

import { getSkillDef } from "../skills/SkillRegistry";
import { getClassDefaultSkill } from "../classes/ClassRegistry";
import { logger } from "../logger";
import { collectTalentSkillMods } from "../talents/TalentRegistry";

export interface CombatHitEvent {
  sessionId: string;
  creatureId: string;
  attackDamage: number;
  targetDefense: number;
  finalDamage: number;
  targetHealth: number;
  targetMaxHealth: number;
  killed: boolean;
  /** Skill that caused this hit (empty string for auto-attack) */
  skillId: string;
}

/** Fired when a skill goes on cooldown (server → client feedback) */
export interface SkillCooldownEvent {
  sessionId: string;
  skillId: string;
  duration: number;
  remaining: number;
}

interface PlayerCombat {
  sessionId: string;
  attackCooldown: number;
  animTimer: number;
  /** Pending damage: timer counts down, applies damage at 0 */
  damageTimer: number;
  damageTarget: CreatureState | null;
  damageTargetId: string;
  damageAmount: number;
  damageAttack: number;
  damageDefense: number;
  /** Active skill cooldowns (seconds remaining), keyed by skill ID */
  skillCooldowns: Map<string, number>;
  /** Player's selected target creature (null = no target, no auto-attack) */
  targetCreatureId: string | null;
  /** Timestamp of last "not facing" feedback to throttle messages */
  lastNotFacingFeedback: number;
  /** Skill ID of the pending damage hit (for reset-on-kill logic) */
  damageSkillId: string;
}

/** Result of finding the closest alive creature in range */
interface TargetResult {
  creature: CreatureState;
  creatureId: string;
}

export class CombatSystem {
  private playerCooldowns: Map<string, PlayerCombat> = new Map();

  registerPlayer(sessionId: string): void {
    this.playerCooldowns.set(sessionId, {
      sessionId,
      attackCooldown: 0,
      animTimer: 0,
      damageTimer: 0,
      damageTarget: null,
      damageTargetId: "",
      damageAmount: 0,
      damageAttack: 0,
      damageDefense: 0,
      skillCooldowns: new Map(),
      targetCreatureId: null,
      lastNotFacingFeedback: 0,
      damageSkillId: "",
    });
  }

  removePlayer(sessionId: string): void {
    this.playerCooldowns.delete(sessionId);
  }

  /** Set the player's manually-selected target creature. */
  setTarget(sessionId: string, targetId: string | null): void {
    const combat = this.playerCooldowns.get(sessionId);
    if (combat) combat.targetCreatureId = targetId;
  }

  /** Clear target for all players that had this creature selected (e.g. on death). */
  clearTargetFor(creatureId: string): void {
    for (const combat of this.playerCooldowns.values()) {
      if (combat.targetCreatureId === creatureId) {
        combat.targetCreatureId = null;
      }
    }
  }

  /** Reset all skill cooldowns for a player (e.g. on respawn). */
  clearCooldowns(sessionId: string): void {
    const combat = this.playerCooldowns.get(sessionId);
    if (combat) combat.skillCooldowns.clear();
  }

  /** Cancel any in-progress attack animation for a player (e.g. on move). */
  cancelAnimation(sessionId: string, player: PlayerState): void {
    const combat = this.playerCooldowns.get(sessionId);
    if (!combat || combat.animTimer <= 0) return;
    combat.animTimer = 0;
    player.animState = "";
  }

  // ── Shared helpers ───────────────────────────────────────────────────────

  /** Find the player's selected target if alive and in range. Returns null if no target set. */
  private findTarget(
    player: PlayerState,
    creatures: Map<string, CreatureState>,
    targetId: string | null = null,
  ): TargetResult | null {
    if (!targetId) return null;

    const target = creatures.get(targetId);
    if (!target || target.isDead) return null;

    const dx = target.x - player.x;
    const dz = target.z - player.z;
    if (dx * dx + dz * dz > player.attackRange * player.attackRange) return null;

    return { creature: target, creatureId: targetId };
  }

  /** Get the current target creature ID for a player. */
  getTarget(sessionId: string): string | null {
    return this.playerCooldowns.get(sessionId)?.targetCreatureId ?? null;
  }

  /** Schedule a delayed hit: face creature, play punch anim, damage after delay. */
  private scheduleHit(
    combat: PlayerCombat,
    player: PlayerState,
    target: TargetResult,
    damage: number,
    animState: string = "punch",
    skillId: string = "",
  ): void {
    // Face the creature
    player.rotY = Math.atan2(target.creature.x - player.x, target.creature.z - player.z);

    // Trigger attack animation — damage applied after delay at animation peak
    player.animState = animState;
    combat.animTimer = ATTACK_ANIM_DURATION;
    combat.damageTimer = DAMAGE_DELAY;
    combat.damageTarget = target.creature;
    combat.damageTargetId = target.creatureId;
    combat.damageAmount = damage;
    combat.damageAttack = player.attackDamage;
    combat.damageDefense = target.creature.defense;
    combat.damageSkillId = skillId;
  }

  // ── Active skill usage ───────────────────────────────────────────────────

  /**
   * Attempt to use an active skill. Returns a SkillCooldownEvent if the skill
   * was successfully activated, or null if it failed (on cooldown, dead, etc.).
   */
  useSkill(
    sessionId: string,
    skillId: string,
    player: PlayerState,
    creatures: Map<string, CreatureState>,
  ): SkillCooldownEvent | null {
    const combat = this.playerCooldowns.get(sessionId);
    if (!combat) return null;
    if (player.lifeState !== LifeState.ALIVE) return null;

    const def = getSkillDef(skillId);
    if (!def || def.passive) return null;
    if (!def.cooldown) return null;

    // Check if skill is on cooldown
    const remaining = combat.skillCooldowns.get(skillId) ?? 0;
    if (remaining > 0) return null;

    // Check player has this skill
    const hasSkill = Array.from(player.skills as Iterable<string>).includes(skillId);
    if (!hasSkill) return null;

    // Apply talent skill modifiers
    const talentMods = collectTalentSkillMods(player.talentAllocations, skillId);
    const cooldown = def.cooldown * talentMods.cooldownMul;

    // ── Buff-type skill (effectId + no damage) — no enemy target needed ──
    if (def.effectId && def.damageMultiplier <= 0) {
      combat.skillCooldowns.set(skillId, cooldown);
      player.animState = def.animState;
      combat.animTimer = ATTACK_ANIM_DURATION;
      return { sessionId, skillId, duration: cooldown, remaining: cooldown };
    }

    // ── AoE damage skill (aoeRange > 0) — no specific target needed ──
    if (def.aoeRange > 0 && def.damageMultiplier > 0) {
      combat.skillCooldowns.set(skillId, cooldown);
      player.animState = def.animState;
      combat.animTimer = ATTACK_ANIM_DURATION;
      combat.attackCooldown = player.attackCooldown;
      return { sessionId, skillId, duration: cooldown, remaining: cooldown };
    }

    // ── Single-target damage skill — needs enemy target ──
    const target = this.findTarget(player, creatures, combat.targetCreatureId);
    if (!target) return null;

    // Check HP threshold (e.g. Execute can only be used on targets below 30% HP)
    if (def.hpThreshold > 0) {
      if (target.creature.health / target.creature.maxHealth > def.hpThreshold) return null;
    }

    const dmgMul = def.damageMultiplier * talentMods.damageMul;

    // Put skill on cooldown
    combat.skillCooldowns.set(skillId, cooldown);

    // Compute damage with multiplier
    const baseDamage = computeDamage(player.attackDamage, target.creature.defense);
    const finalDamage = Math.max(1, Math.round(baseDamage * dmgMul));

    this.scheduleHit(combat, player, target, finalDamage, def.animState, skillId);

    // Reset auto-attack cooldown so skill doesn't "waste" the next auto
    combat.attackCooldown = player.attackCooldown;

    return {
      sessionId,
      skillId,
      duration: cooldown,
      remaining: cooldown,
    };
  }

  /** Get remaining cooldown for a skill (0 if not on cooldown) */
  getSkillCooldown(sessionId: string, skillId: string): number {
    return this.playerCooldowns.get(sessionId)?.skillCooldowns.get(skillId) ?? 0;
  }

  /** Determine why useSkill() returned null — returns the appropriate feedback i18n key. */
  getSkillFailureReason(
    sessionId: string,
    skillId: string,
    player: PlayerState,
    creatures: Map<string, CreatureState>,
  ): string {
    const combat = this.playerCooldowns.get(sessionId);
    if (!combat) return "feedback.noTarget";

    const cd = combat.skillCooldowns.get(skillId) ?? 0;
    if (cd > 0) return "feedback.onCooldown";

    const def = getSkillDef(skillId);
    if (!def) return "feedback.noTarget";

    // Buff and AoE skills should never fail past cooldown check
    if (def.effectId && def.damageMultiplier <= 0) return "feedback.onCooldown";
    if (def.aoeRange > 0 && def.damageMultiplier > 0) return "feedback.onCooldown";

    const target = this.findTarget(player, creatures, combat.targetCreatureId);
    if (!target) return "feedback.noTarget";

    if (
      def.hpThreshold > 0 &&
      target.creature.health / target.creature.maxHealth > def.hpThreshold
    ) {
      return "feedback.targetHealthTooHigh";
    }

    return "feedback.noTarget";
  }

  // ── Per-tick update (auto-attack + timers) ───────────────────────────────

  update(
    dt: number,
    players: Map<string, PlayerState>,
    creatures: Map<string, CreatureState>,
    onHit?: (event: CombatHitEvent) => void,
    onNotFacing?: (sessionId: string) => void,
  ): void {
    for (const [sessionId, combat] of this.playerCooldowns) {
      const player = players.get(sessionId);

      // Tick down skill cooldowns
      for (const [skillId, cd] of combat.skillCooldowns) {
        const newCd = cd - dt;
        if (newCd <= 0) {
          combat.skillCooldowns.delete(skillId);
        } else {
          combat.skillCooldowns.set(skillId, newCd);
        }
      }

      // Tick down anim timer and clear animState when done
      if (combat.animTimer > 0) {
        combat.animTimer -= dt;
        if (combat.animTimer <= 0 && player) {
          player.animState = "";
        }
      }

      // Tick down damage timer — apply damage at punch peak
      if (combat.damageTimer > 0) {
        combat.damageTimer -= dt;
        if (combat.damageTimer <= 0 && combat.damageTarget) {
          combat.damageTarget.health = Math.max(
            0,
            combat.damageTarget.health - combat.damageAmount,
          );
          const killed = combat.damageTarget.health <= 0;
          if (killed) combat.damageTarget.isDead = true;
          const hitSkillId = combat.damageSkillId;
          if (onHit) {
            onHit({
              sessionId,
              creatureId: combat.damageTargetId,
              attackDamage: combat.damageAttack,
              targetDefense: combat.damageDefense,
              finalDamage: combat.damageAmount,
              targetHealth: combat.damageTarget.health,
              targetMaxHealth: combat.damageTarget.maxHealth,
              killed,
              skillId: hitSkillId,
            });
          }
          // Reset cooldown on kill if the skill has resetOnKill
          if (killed && hitSkillId) {
            const hitDef = getSkillDef(hitSkillId);
            if (hitDef?.resetOnKill) {
              combat.skillCooldowns.delete(hitSkillId);
            }
          }
          // Cancel remaining animation follow-through on kill
          if (killed && combat.animTimer > 0 && player) {
            combat.animTimer = 0;
            player.animState = "";
          }
          combat.damageTarget = null;
          combat.damageSkillId = "";
        }
      }

      combat.attackCooldown -= dt;
      if (combat.attackCooldown > 0) continue;

      // Don't auto-attack while another animation is still playing (e.g. heavy_strike)
      if (combat.animTimer > 0) continue;

      if (!player || player.lifeState !== LifeState.ALIVE || !player.online) continue;

      // Skip auto-attack if player has it disabled
      if (!player.autoAttackEnabled) continue;

      const target = this.findTarget(player, creatures, combat.targetCreatureId);
      if (target) {
        // Only auto-attack if player is roughly facing the target (120° arc)
        const angleToTarget = Math.atan2(
          target.creature.x - player.x,
          target.creature.z - player.z,
        );
        if (angleBetween(player.rotY, angleToTarget) > (120 * Math.PI) / 180) {
          // Throttled feedback: only send once every 2 seconds
          const now = Date.now();
          if (!combat.lastNotFacingFeedback || now - combat.lastNotFacingFeedback > 2000) {
            combat.lastNotFacingFeedback = now;
            if (onNotFacing) onNotFacing(sessionId);
          }
          continue;
        }

        const defaultSkill = getClassDefaultSkill(player.classId);
        if (!defaultSkill) {
          logger.warn(
            { classId: player.classId },
            "No default skill for class — skipping auto-attack",
          );
          continue;
        }

        combat.attackCooldown = player.attackCooldown;
        const baseDamage = computeDamage(player.attackDamage, target.creature.defense);
        const damage = Math.max(1, Math.round(baseDamage * defaultSkill.damageMultiplier));
        this.scheduleHit(combat, player, target, damage, defaultSkill.animState);
      }
    }
  }
}
