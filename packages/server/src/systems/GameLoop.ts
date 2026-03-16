import type { ClockTimer } from "@colyseus/timer";
import type { DungeonState } from "../state/DungeonState";
import type { PlayerState } from "../state/PlayerState";
import type { EnemyState } from "../state/EnemyState";
import type { AISystem } from "./AISystem";
import type { CombatSystem, CombatHitEvent } from "./CombatSystem";
import type { ChatSystem } from "../chat/ChatSystem";
import {
  MessageType,
  computeGoldDrop,
  computeXpDrop,
  MAX_LEVEL,
  TILE_SIZE,
  ENTITY_COLLISION_RADIUS,
} from "@dungeon/shared";
import type { TileMap, CombatLogMessage, DebugPathEntry } from "@dungeon/shared";
import { notifyLevelProgress } from "../chat/notifyLevelProgress";

export interface GameLoopBridge {
  readonly state: DungeonState;
  readonly aiSystem: AISystem;
  readonly combatSystem: CombatSystem;
  readonly chatSystem: ChatSystem;
  readonly tileMap: TileMap;
  broadcastToAdmins(type: string, message: unknown): void;
  sendToClient(sessionId: string, type: string, message: unknown): void;
  readonly clock: ClockTimer;
}

export class GameLoop {
  private bridge: GameLoopBridge;
  private lastTickTime: number = 0;
  private tickAccum: number = 0;
  private tickCount: number = 0;
  // Pre-allocated maps reused each tick to avoid GC pressure
  private tickPlayersMap: Map<string, PlayerState> = new Map();
  private tickEnemiesMap: Map<string, EnemyState> = new Map();
  /** Clients subscribed to debug path visualization */
  private debugPathClients: Set<string> = new Set();

  constructor(bridge: GameLoopBridge) {
    this.bridge = bridge;
  }

  update(dt: number): void {
    const now = performance.now();
    if (this.lastTickTime > 0) {
      this.tickAccum += now - this.lastTickTime;
      this.tickCount++;
      if (this.tickAccum >= 1000) {
        this.bridge.state.tickRate = Math.round((this.tickCount / this.tickAccum) * 1000);
        this.tickAccum = 0;
        this.tickCount = 0;
      }
    }
    this.lastTickTime = now;

    const dtSec = dt / 1000;

    // Move players along their paths
    for (const [, player] of this.bridge.state.players) {
      if (player.health <= 0) {
        player.isMoving = false;
        continue;
      }
      this.moveEntity(player, dtSec);
    }

    // AI system: enemies chase and attack players
    this.tickPlayersMap.clear();
    this.bridge.state.players.forEach((player: PlayerState, sessionId: string) => {
      this.tickPlayersMap.set(sessionId, player);
    });

    this.bridge.aiSystem.update(
      dtSec,
      this.tickPlayersMap,
      (sessionId, damage) => {
        const player = this.bridge.state.players.get(sessionId);
        if (!player) return;
        player.health -= damage;
        if (player.health < 0) player.health = 0;
        if (player.health <= 0) {
          const name = player.characterName || sessionId.slice(0, 6);
          this.bridge.chatSystem.broadcastSystemI18n(
            "chat.slain",
            { name },
            `${name} has been slain!`,
          );
        }
      },
      (event) => {
        const enemy = this.bridge.state.enemies.get(event.enemyId);
        const player = this.bridge.state.players.get(event.sessionId);
        if (!player) return;
        const msg: CombatLogMessage = {
          dir: "e2p",
          src: `${enemy?.enemyType ?? "enemy"}[${event.enemyId}]`,
          tgt: player.characterName || event.sessionId.slice(0, 6),
          atk: event.attackDamage,
          def: event.targetDefense,
          dmg: event.finalDamage,
          hp: player.health,
          maxHp: player.maxHealth,
          kill: player.health <= 0,
        };
        this.bridge.broadcastToAdmins(MessageType.COMBAT_LOG, msg);
      },
    );

    // Combat system: player auto-attack
    this.tickEnemiesMap.clear();
    this.bridge.state.enemies.forEach((enemy: EnemyState, id: string) => {
      this.tickEnemiesMap.set(id, enemy);
    });

    this.bridge.combatSystem.update(dtSec, this.tickPlayersMap, this.tickEnemiesMap, (event) => {
      this.handleCombatHit(event);
    });

    // Resolve entity-to-entity collisions (push overlapping entities apart)
    this.resolveEntityCollisions();

    // Debug: send path data to subscribed admin clients
    if (this.debugPathClients.size > 0) {
      this.sendDebugPaths();
    }
  }

  /** Handle a combat hit event — shared between auto-attack and active skills. */
  handleCombatHit(event: CombatHitEvent): void {
    // Player hit generates threat on the enemy
    this.bridge.aiSystem.addThreat(event.enemyId, event.sessionId, event.finalDamage);

    const player = this.bridge.state.players.get(event.sessionId);
    const msg: CombatLogMessage = {
      dir: "p2e",
      src: player?.characterName || event.sessionId.slice(0, 6),
      tgt: `zombie[${event.enemyId}]`,
      atk: event.attackDamage,
      def: event.targetDefense,
      dmg: event.finalDamage,
      hp: event.targetHealth,
      maxHp: event.targetMaxHealth,
      kill: event.killed,
    };
    this.bridge.broadcastToAdmins(MessageType.COMBAT_LOG, msg);

    // Remove dead enemy from state after a short delay so clients see the death
    if (event.killed) {
      // Distribute gold to alive party members
      const killedEnemy = this.bridge.state.enemies.get(event.enemyId);
      if (killedEnemy) {
        let aliveCount = 0;
        let levelSum = 0;
        this.bridge.state.players.forEach((p: PlayerState) => {
          if (p.health > 0) {
            aliveCount++;
            levelSum += p.level;
          }
        });
        const avgPartyLevel = aliveCount > 0 ? levelSum / aliveCount : 1;
        const goldPerPlayer = computeGoldDrop(killedEnemy.level, avgPartyLevel, aliveCount);

        this.bridge.state.players.forEach((p: PlayerState) => {
          if (p.health > 0) {
            p.gold += goldPerPlayer;
          }
        });

        // Broadcast gold earned in chat
        this.bridge.chatSystem.broadcastSystemI18n(
          "chat.goldGained",
          { amount: goldPerPlayer, enemy: killedEnemy.enemyType },
          `+${goldPerPlayer} gold from ${killedEnemy.enemyType}!`,
        );

        // Distribute XP to alive players (not split — each player gets full XP)
        this.bridge.state.players.forEach((p: PlayerState, sessionId: string) => {
          if (p.health <= 0 || p.level >= MAX_LEVEL) return;

          const xpGain = computeXpDrop(killedEnemy.level, p.level);
          const levelUps = p.addXp(xpGain);

          if (levelUps.length > 0) {
            notifyLevelProgress(
              sessionId,
              p,
              levelUps,
              this.bridge.chatSystem,
              this.bridge.sendToClient.bind(this.bridge),
            );
          }
        });
      }

      this.bridge.clock.setTimeout(() => {
        this.bridge.state.enemies.delete(event.enemyId);
        this.bridge.aiSystem.unregister(event.enemyId);
      }, 1000);
    }
  }

  moveEntity(entity: PlayerState, dt: number): void {
    if (!entity.isMoving || entity.currentPathIndex >= entity.path.length) {
      entity.isMoving = false;
      return;
    }

    let remaining = entity.speed * dt;

    while (remaining > 0 && entity.currentPathIndex < entity.path.length) {
      const target = entity.path[entity.currentPathIndex];
      const dx = target.x - entity.x;
      const dz = target.z - entity.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 0.01) {
        entity.currentPathIndex++;
        continue;
      }

      const ndx = dx / dist;
      const ndz = dz / dist;
      entity.rotY = Math.atan2(ndx, ndz);

      if (remaining >= dist) {
        // Snap to waypoint and consume distance, continue to next
        entity.x = target.x;
        entity.z = target.z;
        remaining -= dist;
        entity.currentPathIndex++;
      } else {
        // Partial move toward waypoint
        entity.x += ndx * remaining;
        entity.z += ndz * remaining;
        remaining = 0;
      }
    }

    if (entity.currentPathIndex >= entity.path.length) {
      entity.isMoving = false;
    }
  }

  // ── Entity collision resolution ──────────────────────────────────────

  private collisionEntities: { x: number; z: number; setPos: (x: number, z: number) => void }[] =
    [];

  private resolveEntityCollisions(): void {
    const DIAMETER = ENTITY_COLLISION_RADIUS * 2;
    const DIAMETER_SQ = DIAMETER * DIAMETER;

    // Build flat array of alive entities (reuse array to reduce GC)
    const entities = this.collisionEntities;
    entities.length = 0;

    this.bridge.state.players.forEach((player: PlayerState) => {
      if (player.health <= 0) return;
      entities.push({
        get x() {
          return player.x;
        },
        get z() {
          return player.z;
        },
        setPos(x, z) {
          player.x = x;
          player.z = z;
        },
      });
    });

    this.bridge.state.enemies.forEach((enemy: EnemyState) => {
      if (enemy.isDead) return;
      entities.push({
        get x() {
          return enemy.x;
        },
        get z() {
          return enemy.z;
        },
        setPos(x, z) {
          enemy.x = x;
          enemy.z = z;
        },
      });
    });

    // O(n^2) pair check — fine for <50 entities in a dungeon
    for (let i = 0; i < entities.length; i++) {
      for (let j = i + 1; j < entities.length; j++) {
        const a = entities[i];
        const b = entities[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const distSq = dx * dx + dz * dz;

        if (distSq >= DIAMETER_SQ) continue;

        const dist = Math.sqrt(distSq);
        const overlap = DIAMETER - dist;

        // Normalized push direction (b away from a)
        let nx: number, nz: number;
        if (dist < 0.001) {
          nx = 1;
          nz = 0;
        } else {
          nx = dx / dist;
          nz = dz / dist;
        }

        const half = overlap / 2;

        // Candidate positions
        const ax = a.x - nx * half;
        const az = a.z - nz * half;
        const bx = b.x + nx * half;
        const bz = b.z + nz * half;

        const aValid = this.isWalkable(ax, az);
        const bValid = this.isWalkable(bx, bz);

        if (aValid && bValid) {
          a.setPos(ax, az);
          b.setPos(bx, bz);
        } else if (aValid && !bValid) {
          a.setPos(a.x - nx * overlap, a.z - nz * overlap);
        } else if (!aValid && bValid) {
          b.setPos(b.x + nx * overlap, b.z + nz * overlap);
        }
        // Both in walls → do nothing, pathfinder will resolve next repath
      }
    }
  }

  private isWalkable(worldX: number, worldZ: number): boolean {
    const tx = Math.round(worldX / TILE_SIZE);
    const tz = Math.round(worldZ / TILE_SIZE);
    return this.bridge.tileMap.isFloor(tx, tz);
  }

  setDebugPaths(sessionId: string, enabled: boolean): void {
    if (enabled) {
      this.debugPathClients.add(sessionId);
    } else {
      this.debugPathClients.delete(sessionId);
    }
  }

  removeDebugClient(sessionId: string): void {
    this.debugPathClients.delete(sessionId);
  }

  private sendDebugPaths(): void {
    const paths: DebugPathEntry[] = [];

    this.bridge.state.players.forEach((player: PlayerState, sessionId: string) => {
      if (player.path.length > 0 && player.currentPathIndex < player.path.length) {
        paths.push({
          id: sessionId,
          kind: "player",
          x: player.x,
          z: player.z,
          path: player.path.slice(player.currentPathIndex),
        });
      }
    });

    this.bridge.state.enemies.forEach((enemy: EnemyState, enemyId: string) => {
      if (enemy.path.length > 0 && enemy.currentPathIndex < enemy.path.length) {
        paths.push({
          id: enemyId,
          kind: "enemy",
          x: enemy.x,
          z: enemy.z,
          path: enemy.path.slice(enemy.currentPathIndex),
        });
      }
    });

    const msg = { paths };
    for (const sessionId of this.debugPathClients) {
      this.bridge.sendToClient(sessionId, MessageType.DEBUG_PATHS, msg);
    }
  }
}
