import type { PlayerState } from "../state/PlayerState";
import type { EnemyState } from "../state/EnemyState";
import { PLAYER_ATTACK_DAMAGE, PLAYER_ATTACK_RANGE, PLAYER_ATTACK_COOLDOWN } from "@dungeon/shared";

interface PlayerCombat {
  sessionId: string;
  attackCooldown: number;
}

export class CombatSystem {
  private playerCooldowns: Map<string, PlayerCombat> = new Map();

  registerPlayer(sessionId: string): void {
    this.playerCooldowns.set(sessionId, {
      sessionId,
      attackCooldown: 0,
    });
  }

  removePlayer(sessionId: string): void {
    this.playerCooldowns.delete(sessionId);
  }

  update(dt: number, players: Map<string, PlayerState>, enemies: Map<string, EnemyState>): void {
    for (const [sessionId, combat] of this.playerCooldowns) {
      combat.attackCooldown -= dt;
      if (combat.attackCooldown > 0) continue;

      const player = players.get(sessionId);
      if (!player || player.health <= 0) continue;

      // Find closest alive enemy in range
      let closest: EnemyState | null = null;
      let closestDist = Infinity;

      for (const [, enemy] of enemies) {
        if (enemy.isDead) continue;
        const dx = enemy.x - player.x;
        const dz = enemy.z - player.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist <= PLAYER_ATTACK_RANGE && dist < closestDist) {
          closest = enemy;
          closestDist = dist;
        }
      }

      if (closest) {
        combat.attackCooldown = PLAYER_ATTACK_COOLDOWN;
        closest.health -= PLAYER_ATTACK_DAMAGE;

        // Face the enemy
        const angle = Math.atan2(closest.x - player.x, closest.z - player.z);
        player.rotY = angle;

        if (closest.health <= 0) {
          closest.health = 0;
          closest.isDead = true;
        }
      }
    }
  }
}
