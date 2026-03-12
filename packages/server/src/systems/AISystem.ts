import type { EnemyState } from "../state/EnemyState";
import type { PlayerState } from "../state/PlayerState";
import type { Pathfinder, WorldPos } from "../navigation/Pathfinder";
import {
  ENEMY_DETECTION_RANGE,
  ENEMY_ATTACK_RANGE,
  ENEMY_ATTACK_COOLDOWN,
  ENEMY_ATTACK_DAMAGE,
  ENEMY_REPATH_INTERVAL,
  ENEMY_SPEED,
} from "@dungeon/shared";

const AIState = {
  IDLE: 0,
  CHASE: 1,
  ATTACK: 2,
} as const;

type AIStateType = (typeof AIState)[keyof typeof AIState];

interface EnemyAI {
  enemy: EnemyState;
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

  register(enemy: EnemyState): void {
    enemy.speed = ENEMY_SPEED;
    this.entries.push({
      enemy,
      state: AIState.IDLE,
      repathTimer: 0,
      attackTimer: 0,
    });
  }

  update(
    dt: number,
    players: Map<string, PlayerState>,
    onPlayerHit: (sessionId: string, damage: number) => void,
  ): void {
    for (const entry of this.entries) {
      if (entry.enemy.isDead) continue;

      // Find closest alive player
      let closestPlayer: PlayerState | null = null;
      let closestSessionId: string | null = null;
      let closestDist = Infinity;

      for (const [sessionId, player] of players) {
        if (player.health <= 0) continue;
        const dist = this.distance(entry.enemy, player);
        if (dist < closestDist) {
          closestDist = dist;
          closestPlayer = player;
          closestSessionId = sessionId;
        }
      }

      if (!closestPlayer || !closestSessionId) {
        entry.state = AIState.IDLE;
        entry.enemy.isMoving = false;
        continue;
      }

      entry.repathTimer -= dt;
      entry.attackTimer -= dt;

      if (closestDist <= ENEMY_ATTACK_RANGE) {
        // Attack state
        entry.state = AIState.ATTACK;
        entry.enemy.isMoving = false;
        entry.enemy.path = [];

        // Face the player
        const angle = Math.atan2(closestPlayer.x - entry.enemy.x, closestPlayer.z - entry.enemy.z);
        entry.enemy.rotY = angle;

        if (entry.attackTimer <= 0) {
          entry.attackTimer = ENEMY_ATTACK_COOLDOWN;
          onPlayerHit(closestSessionId, ENEMY_ATTACK_DAMAGE);
        }
      } else if (closestDist <= ENEMY_DETECTION_RANGE) {
        // Chase state
        entry.state = AIState.CHASE;

        if (entry.repathTimer <= 0) {
          entry.repathTimer = ENEMY_REPATH_INTERVAL;
          const enemyPos: WorldPos = { x: entry.enemy.x, z: entry.enemy.z };
          const playerPos: WorldPos = { x: closestPlayer.x, z: closestPlayer.z };
          const path = this.pathfinder.findPath(enemyPos, playerPos);
          if (path.length > 0) {
            entry.enemy.path = path;
            entry.enemy.currentPathIndex = 0;
            entry.enemy.isMoving = true;
          }
        }

        this.moveEnemy(entry.enemy, dt);
      } else {
        // Idle state
        entry.state = AIState.IDLE;
        entry.enemy.isMoving = false;
      }
    }
  }

  private moveEnemy(enemy: EnemyState, dt: number): void {
    if (!enemy.isMoving || enemy.currentPathIndex >= enemy.path.length) {
      enemy.isMoving = false;
      return;
    }

    const target = enemy.path[enemy.currentPathIndex];
    const dx = target.x - enemy.x;
    const dz = target.z - enemy.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.15) {
      enemy.currentPathIndex++;
      if (enemy.currentPathIndex >= enemy.path.length) {
        enemy.isMoving = false;
      }
      return;
    }

    const ndx = dx / dist;
    const ndz = dz / dist;
    const step = Math.min(enemy.speed * dt, dist);

    enemy.x += ndx * step;
    enemy.z += ndz * step;

    enemy.rotY = Math.atan2(ndx, ndz);
  }

  private distance(a: { x: number; z: number }, b: { x: number; z: number }): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz);
  }
}
