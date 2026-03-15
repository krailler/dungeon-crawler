import type { ClockTimer } from "@colyseus/timer";
import type { DungeonState } from "../state/DungeonState";
import type { PlayerState } from "../state/PlayerState";
import type { EnemyState } from "../state/EnemyState";
import type { AISystem } from "./AISystem";
import type { CombatSystem } from "./CombatSystem";
import type { ChatSystem } from "../chat/ChatSystem";
import { MessageType, computeGoldDrop, computeXpDrop, MAX_LEVEL } from "@dungeon/shared";
import type { CombatLogMessage, DebugPathEntry } from "@dungeon/shared";

export interface GameLoopBridge {
  readonly state: DungeonState;
  readonly aiSystem: AISystem;
  readonly combatSystem: CombatSystem;
  readonly chatSystem: ChatSystem;
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

            for (const { level, dhp, datk, ddef } of levelUps) {
              this.bridge.chatSystem.broadcastSystemI18n(
                "chat.levelUp",
                { name: p.characterName, level },
                `${p.characterName} reached level ${level}!`,
              );
              this.bridge.chatSystem.sendSystemI18nTo(
                sessionId,
                "chat.levelUpStats",
                { dhp, datk, ddef },
                `+${dhp} Health\n+${datk} Attack\n+${ddef} Defense`,
              );
            }
          });
        }

        this.bridge.clock.setTimeout(() => {
          this.bridge.state.enemies.delete(event.enemyId);
          this.bridge.aiSystem.unregister(event.enemyId);
        }, 1000);
      }
    });

    // Debug: send path data to subscribed admin clients
    if (this.debugPathClients.size > 0) {
      this.sendDebugPaths();
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
