import type { PlayerState } from "../state/PlayerState";
import type { EnemyState } from "../state/EnemyState";
import { ATTACK_ANIM_DURATION, computeDamage } from "@dungeon/shared";

const DAMAGE_DELAY = ATTACK_ANIM_DURATION / 2;

interface PlayerCombat {
  sessionId: string;
  attackCooldown: number;
  animTimer: number;
  /** Pending damage: timer counts down, applies damage at 0 */
  damageTimer: number;
  damageTarget: EnemyState | null;
  damageAmount: number;
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
      damageAmount: 0,
    });
  }

  removePlayer(sessionId: string): void {
    this.playerCooldowns.delete(sessionId);
  }

  update(dt: number, players: Map<string, PlayerState>, enemies: Map<string, EnemyState>): void {
    for (const [sessionId, combat] of this.playerCooldowns) {
      const player = players.get(sessionId);

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
          if (combat.damageTarget.health <= 0) {
            combat.damageTarget.health = 0;
            combat.damageTarget.isDead = true;
          }
          combat.damageTarget = null;
        }
      }

      combat.attackCooldown -= dt;
      if (combat.attackCooldown > 0) continue;

      if (!player || player.health <= 0) continue;

      // Find closest alive enemy in range
      let closest: EnemyState | null = null;
      let closestDist = Infinity;

      for (const [, enemy] of enemies) {
        if (enemy.isDead) continue;
        const dx = enemy.x - player.x;
        const dz = enemy.z - player.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= player.attackRange && dist < closestDist) {
          closest = enemy;
          closestDist = dist;
        }
      }

      if (closest) {
        combat.attackCooldown = player.attackCooldown;

        // Face the enemy
        const angle = Math.atan2(closest.x - player.x, closest.z - player.z);
        player.rotY = angle;

        // Trigger punch animation — damage delayed to peak
        player.animState = "punch";
        combat.animTimer = ATTACK_ANIM_DURATION;
        combat.damageTimer = DAMAGE_DELAY;
        combat.damageTarget = closest;
        combat.damageAmount = computeDamage(player.attackDamage, closest.defense);
      }
    }
  }
}
