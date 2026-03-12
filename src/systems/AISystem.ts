import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Enemy } from "../entities/Enemy";
import type { Pathfinder } from "../navigation/Pathfinder";
import { ENEMY_DETECTION_RANGE, ENEMY_ATTACK_RANGE } from "../utils/Constants";

const REPATH_INTERVAL = 0.5; // seconds between path recalculations
const ATTACK_COOLDOWN = 1.5;
const ATTACK_DAMAGE = 8;

const AIState = {
  IDLE: 0,
  CHASE: 1,
  ATTACK: 2,
} as const;

type AIStateType = (typeof AIState)[keyof typeof AIState];

interface EnemyAI {
  enemy: Enemy;
  state: AIStateType;
  repathTimer: number;
  attackTimer: number;
}

export class AISystem {
  private entries: EnemyAI[] = [];
  private pathfinder: Pathfinder;

  constructor(pathfinder: Pathfinder) {
    this.pathfinder = pathfinder;
  }

  register(enemy: Enemy): void {
    this.entries.push({
      enemy,
      state: AIState.IDLE,
      repathTimer: 0,
      attackTimer: 0,
    });
  }

  update(dt: number, playerPos: Vector3, onPlayerHit: (damage: number) => void): void {
    for (const entry of this.entries) {
      if (entry.enemy.isDead) continue;

      const dist = entry.enemy.distanceTo(playerPos);
      entry.repathTimer -= dt;
      entry.attackTimer -= dt;

      if (dist <= ENEMY_ATTACK_RANGE) {
        // Attack state
        entry.state = AIState.ATTACK;
        entry.enemy.isMoving = false;

        // Face the player
        const ePos = entry.enemy.mesh.position;
        const angle = Math.atan2(playerPos.x - ePos.x, playerPos.z - ePos.z);
        entry.enemy.mesh.rotation.y = angle;

        if (entry.attackTimer <= 0) {
          entry.attackTimer = ATTACK_COOLDOWN;
          onPlayerHit(ATTACK_DAMAGE);
        }
      } else if (dist <= ENEMY_DETECTION_RANGE) {
        // Chase state
        entry.state = AIState.CHASE;

        if (entry.repathTimer <= 0) {
          entry.repathTimer = REPATH_INTERVAL;
          const path = this.pathfinder.findPath(
            entry.enemy.getWorldPosition(),
            playerPos,
          );
          if (path.length > 0) {
            entry.enemy.setPath(path);
          }
        }

        entry.enemy.update(dt);
      } else {
        // Idle state
        entry.state = AIState.IDLE;
        entry.enemy.isMoving = false;
      }
    }
  }

  getAliveEnemies(): Enemy[] {
    return this.entries
      .filter((e) => !e.enemy.isDead)
      .map((e) => e.enemy);
  }
}
