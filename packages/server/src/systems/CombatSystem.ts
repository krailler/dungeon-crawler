import type { PlayerState } from "../state/PlayerState";
import type { CreatureState } from "../state/CreatureState";
import { ATTACK_ANIM_DURATION, computeDamage, SKILL_DEFS, SkillId } from "@dungeon/shared";
import type { SkillIdValue } from "@dungeon/shared";

const DAMAGE_DELAY = ATTACK_ANIM_DURATION / 2;

export interface CombatHitEvent {
  sessionId: string;
  creatureId: string;
  attackDamage: number;
  targetDefense: number;
  finalDamage: number;
  targetHealth: number;
  targetMaxHealth: number;
  killed: boolean;
}

/** Fired when a skill goes on cooldown (server → client feedback) */
export interface SkillCooldownEvent {
  sessionId: string;
  skillId: SkillIdValue;
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
  /** Player's manually-selected target creature (null = auto-target closest) */
  targetCreatureId: string | null;
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

  // ── Shared helpers ───────────────────────────────────────────────────────

  /** Find an alive creature to attack. Prefers the player's selected target if in range. */
  private findTarget(
    player: PlayerState,
    creatures: Map<string, CreatureState>,
    preferredId: string | null = null,
  ): TargetResult | null {
    // Prefer manually-selected target if alive and in range
    if (preferredId) {
      const preferred = creatures.get(preferredId);
      if (preferred && !preferred.isDead) {
        const dx = preferred.x - player.x;
        const dz = preferred.z - player.z;
        if (Math.sqrt(dx * dx + dz * dz) <= player.attackRange) {
          return { creature: preferred, creatureId: preferredId };
        }
      }
    }

    // Fallback: closest alive creature in range
    let closest: CreatureState | null = null;
    let closestId = "";
    let closestDist = Infinity;

    for (const [creatureId, creature] of creatures) {
      if (creature.isDead) continue;
      const dx = creature.x - player.x;
      const dz = creature.z - player.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= player.attackRange && dist < closestDist) {
        closest = creature;
        closestId = creatureId;
        closestDist = dist;
      }
    }

    return closest ? { creature: closest, creatureId: closestId } : null;
  }

  /** Schedule a delayed hit: face creature, play punch anim, damage after delay. */
  private scheduleHit(
    combat: PlayerCombat,
    player: PlayerState,
    target: TargetResult,
    damage: number,
    animState: string = "punch",
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
  }

  // ── Active skill usage ───────────────────────────────────────────────────

  /**
   * Attempt to use an active skill. Returns a SkillCooldownEvent if the skill
   * was successfully activated, or null if it failed (on cooldown, dead, etc.).
   */
  useSkill(
    sessionId: string,
    skillId: SkillIdValue,
    player: PlayerState,
    creatures: Map<string, CreatureState>,
  ): SkillCooldownEvent | null {
    const combat = this.playerCooldowns.get(sessionId);
    if (!combat) return null;
    if (player.health <= 0) return null;

    const def = SKILL_DEFS[skillId];
    if (!def || def.passive) return null;
    if (!def.cooldown) return null;

    // Check if skill is on cooldown
    const remaining = combat.skillCooldowns.get(skillId) ?? 0;
    if (remaining > 0) return null;

    // Check player has this skill
    const hasSkill = Array.from(player.skills as Iterable<string>).includes(skillId);
    if (!hasSkill) return null;

    // Need a target in range (prefer player's selected target)
    const target = this.findTarget(player, creatures, combat.targetCreatureId);
    if (!target) return null;

    // Put skill on cooldown
    combat.skillCooldowns.set(skillId, def.cooldown);

    // Compute damage with multiplier
    const baseDamage = computeDamage(player.attackDamage, target.creature.defense);
    const finalDamage = Math.max(1, Math.round(baseDamage * (def.damageMultiplier ?? 1)));

    const skillAnim = skillId === SkillId.HEAVY_STRIKE ? "heavy_punch" : "punch";
    this.scheduleHit(combat, player, target, finalDamage, skillAnim);

    // Reset auto-attack cooldown so heavy strike doesn't "waste" the next auto
    combat.attackCooldown = player.attackCooldown;

    return {
      sessionId,
      skillId,
      duration: def.cooldown,
      remaining: def.cooldown,
    };
  }

  /** Get remaining cooldown for a skill (0 if not on cooldown) */
  getSkillCooldown(sessionId: string, skillId: string): number {
    return this.playerCooldowns.get(sessionId)?.skillCooldowns.get(skillId) ?? 0;
  }

  // ── Per-tick update (auto-attack + timers) ───────────────────────────────

  update(
    dt: number,
    players: Map<string, PlayerState>,
    creatures: Map<string, CreatureState>,
    onHit?: (event: CombatHitEvent) => void,
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
          combat.damageTarget.health -= combat.damageAmount;
          const killed = combat.damageTarget.health <= 0;
          if (killed) {
            combat.damageTarget.health = 0;
            combat.damageTarget.isDead = true;
          }
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
            });
          }
          combat.damageTarget = null;
        }
      }

      combat.attackCooldown -= dt;
      if (combat.attackCooldown > 0) continue;

      if (!player || player.health <= 0) continue;

      // Skip auto-attack if player has it disabled
      if (!player.autoAttackEnabled) continue;

      const target = this.findTarget(player, creatures, combat.targetCreatureId);
      if (target) {
        combat.attackCooldown = player.attackCooldown;
        const damage = computeDamage(player.attackDamage, target.creature.defense);
        this.scheduleHit(combat, player, target, damage);
      }
    }
  }
}
