import type { Player } from "../entities/Player";
import type { Enemy } from "../entities/Enemy";
import {
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_RANGE,
  PLAYER_ATTACK_COOLDOWN,
} from "../utils/Constants";

export class CombatSystem {
  private attackCooldown: number = 0;

  update(dt: number, player: Player, enemies: Enemy[]): void {
    this.attackCooldown -= dt;

    if (this.attackCooldown > 0) return;

    // Find closest alive enemy in range
    let closest: Enemy | null = null;
    let closestDist = Infinity;
    const playerPos = player.getWorldPosition();

    for (const enemy of enemies) {
      if (enemy.isDead) continue;
      const dist = enemy.distanceTo(playerPos);
      if (dist <= PLAYER_ATTACK_RANGE && dist < closestDist) {
        closest = enemy;
        closestDist = dist;
      }
    }

    if (closest) {
      this.attackCooldown = PLAYER_ATTACK_COOLDOWN;
      closest.takeDamage(PLAYER_ATTACK_DAMAGE);

      // Face the enemy
      const ePos = closest.mesh.position;
      const angle = Math.atan2(
        ePos.x - player.mesh.position.x,
        ePos.z - player.mesh.position.z,
      );
      player.mesh.rotation.y = angle;
    }
  }
}
