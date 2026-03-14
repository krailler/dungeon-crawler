import { Room } from "colyseus";
import type { Client } from "colyseus";
import type { Logger } from "pino";
import { createRoomLogger, pid } from "../logger";
import { DungeonState } from "../state/DungeonState";
import { PlayerState } from "../state/PlayerState";
import { EnemyState } from "../state/EnemyState";
import { DungeonGenerator } from "../dungeon/DungeonGenerator";
import type { Room as DungeonRoomDef } from "../dungeon/DungeonGenerator";
import { Pathfinder } from "../navigation/Pathfinder";
import { AISystem } from "../systems/AISystem";
import { CombatSystem } from "../systems/CombatSystem";
import {
  DUNGEON_WIDTH,
  DUNGEON_HEIGHT,
  DUNGEON_ROOMS,
  TILE_SIZE,
  PLAYER_SPEED,
  PLAYER_HEALTH,
  ENEMY_HEALTH,
  ENEMY_SPEED,
  TileType,
  type TileMap,
  MessageType,
  generateFloorVariants,
  generateWallVariants,
  assignRoomSets,
} from "@dungeon/shared";
import type { MoveMessage } from "@dungeon/shared";
import { mulberry32 } from "@dungeon/shared";

const TICK_RATE = 64; // ms between simulation ticks

/** Fixed seed for deterministic dungeon generation (set to null for random). */
const DUNGEON_SEED: number | null = 42;

export class DungeonRoom extends Room<{ state: DungeonState }> {
  private pathfinder!: Pathfinder;
  private aiSystem!: AISystem;
  private combatSystem!: CombatSystem;
  private tileMap!: TileMap;
  private log!: Logger;

  onCreate(): void {
    this.log = createRoomLogger(this.roomId);
    // Keep the room alive even when all players leave
    this.autoDispose = false;

    this.state = new DungeonState();

    // Generate dungeon
    const seed = DUNGEON_SEED ?? Date.now();
    const generator = new DungeonGenerator();
    this.tileMap = generator.generate(DUNGEON_WIDTH, DUNGEON_HEIGHT, DUNGEON_ROOMS, seed);

    // Serialize map for clients
    this.state.tileMapData = JSON.stringify(this.tileMap.serializeGrid());
    this.state.mapWidth = this.tileMap.width;
    this.state.mapHeight = this.tileMap.height;

    // Generate deterministic floor tile variants with per-room tile sets
    const rooms = generator.getRooms();
    const roomOwnership = generator.getRoomOwnership();
    const roomSets = assignRoomSets(rooms.length, seed);
    const floorVariants = generateFloorVariants(this.tileMap, seed, roomOwnership, roomSets);
    this.state.floorVariantData = JSON.stringify(floorVariants);

    const wallVariants = generateWallVariants(this.tileMap, seed, roomOwnership, roomSets);
    this.state.wallVariantData = JSON.stringify(wallVariants);

    // Setup pathfinding
    this.pathfinder = new Pathfinder(this.tileMap);

    // Setup systems
    this.aiSystem = new AISystem(this.pathfinder);
    this.combatSystem = new CombatSystem();
    const spawnRng = mulberry32(seed ^ 0x454e454d); // separate sequence for enemy spawns
    this.spawnEnemies(rooms, spawnRng);

    // Register message handlers
    this.onMessage(MessageType.MOVE, this.handleMove.bind(this));

    // Game loop
    this.setSimulationInterval(this.update.bind(this), TICK_RATE);

    this.log.info({ rooms: rooms.length, enemies: this.state.enemies.size }, "Room created");
  }

  onJoin(client: Client): void {
    this.log.info({ player: pid(client.sessionId) }, "Player joined");

    const player = new PlayerState();
    player.speed = PLAYER_SPEED;
    player.health = PLAYER_HEALTH;
    player.maxHealth = PLAYER_HEALTH;

    // Find spawn position
    const spawnPos = this.findSpawnPosition();
    if (spawnPos) {
      player.x = spawnPos.x;
      player.z = spawnPos.z;
    }

    this.state.players.set(client.sessionId, player);
    this.combatSystem.registerPlayer(client.sessionId);
  }

  async onDrop(client: Client): Promise<void> {
    this.log.warn({ player: pid(client.sessionId) }, "Player dropped — waiting 120s for reconnect");

    // Stop the player while disconnected
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isMoving = false;
      player.path = [];
      player.currentPathIndex = 0;
    }

    // Allow reconnection for 120 seconds
    try {
      await this.allowReconnection(client, 120);
    } catch {
      // Reconnection timed out — remove player
      this.log.info({ player: pid(client.sessionId) }, "Reconnection timed out — player removed");
      this.state.players.delete(client.sessionId);
      this.combatSystem.removePlayer(client.sessionId);
    }
  }

  onReconnect(client: Client): void {
    this.log.info({ player: pid(client.sessionId) }, "Player reconnected");
  }

  onLeave(client: Client): void {
    this.log.info({ player: pid(client.sessionId) }, "Player left");
    this.state.players.delete(client.sessionId);
    this.combatSystem.removePlayer(client.sessionId);
  }

  private handleMove(client: Client, data: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.health <= 0) return;

    // Validate target is a floor tile
    const tx = Math.round(data.x / TILE_SIZE);
    const tz = Math.round(data.z / TILE_SIZE);
    if (!this.tileMap.isFloor(tx, tz)) return;

    // Pathfind from player position to target
    const path = this.pathfinder.findPath({ x: player.x, z: player.z }, { x: data.x, z: data.z });

    if (path.length > 0) {
      player.path = path;
      player.currentPathIndex = 0;
      player.isMoving = true;
    }
  }

  private update(dt: number): void {
    const dtSec = dt / 1000;

    // Move players along their paths
    for (const [, player] of this.state.players) {
      if (player.health <= 0) {
        player.isMoving = false;
        continue;
      }
      this.moveEntity(player, dtSec);
    }

    // AI system: enemies chase and attack players
    const playersMap = new Map<string, PlayerState>();
    this.state.players.forEach((player: PlayerState, sessionId: string) => {
      playersMap.set(sessionId, player);
    });

    this.aiSystem.update(dtSec, playersMap, (sessionId, damage) => {
      const player = this.state.players.get(sessionId);
      if (!player) return;
      player.health -= damage;
      if (player.health < 0) player.health = 0;
    });

    // Combat system: player auto-attack
    const enemiesMap = new Map<string, EnemyState>();
    this.state.enemies.forEach((enemy: EnemyState, id: string) => {
      enemiesMap.set(id, enemy);
    });

    this.combatSystem.update(dtSec, playersMap, enemiesMap);
  }

  private moveEntity(entity: PlayerState, dt: number): void {
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

  private spawnEnemies(rooms: DungeonRoomDef[], rng: () => number): void {
    let enemyId = 0;
    // Skip first room (player spawn)
    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      const enemyCount = 1 + Math.floor(rng() * 2);

      for (let j = 0; j < enemyCount; j++) {
        const tileX = room.x + 1 + Math.floor(rng() * (room.w - 2));
        const tileY = room.y + 1 + Math.floor(rng() * (room.h - 2));

        const enemy = new EnemyState();
        enemy.x = tileX * TILE_SIZE;
        enemy.z = tileY * TILE_SIZE;
        enemy.health = ENEMY_HEALTH;
        enemy.maxHealth = ENEMY_HEALTH;
        enemy.speed = ENEMY_SPEED;

        const id = `enemy_${enemyId++}`;
        this.state.enemies.set(id, enemy);
        this.aiSystem.register(enemy);
      }
    }
  }

  private findSpawnPosition(): { x: number; z: number } | null {
    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        if (this.tileMap.get(x, y) === TileType.SPAWN) {
          return { x: x * TILE_SIZE, z: y * TILE_SIZE };
        }
      }
    }
    return null;
  }
}
