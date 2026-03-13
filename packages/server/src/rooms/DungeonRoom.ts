import { Room } from "colyseus";
import type { Client } from "colyseus";
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
  assignRoomSets,
} from "@dungeon/shared";
import type { MoveMessage } from "@dungeon/shared";

const TICK_RATE = 50; // ms between simulation ticks (~20 ticks/sec)

export class DungeonRoom extends Room<{ state: DungeonState }> {
  private pathfinder!: Pathfinder;
  private aiSystem!: AISystem;
  private combatSystem!: CombatSystem;
  private tileMap!: TileMap;

  onCreate(): void {
    this.state = new DungeonState();

    // Generate dungeon
    const generator = new DungeonGenerator();
    this.tileMap = generator.generate(DUNGEON_WIDTH, DUNGEON_HEIGHT, DUNGEON_ROOMS);

    // Serialize map for clients
    this.state.tileMapData = JSON.stringify(this.tileMap.serializeGrid());
    this.state.mapWidth = this.tileMap.width;
    this.state.mapHeight = this.tileMap.height;

    // Generate deterministic floor tile variants with per-room tile sets
    const rooms = generator.getRooms();
    const roomOwnership = generator.getRoomOwnership();
    const seed = Date.now();
    const roomSets = assignRoomSets(rooms.length, seed);
    const floorVariants = generateFloorVariants(this.tileMap, seed, roomOwnership, roomSets);
    this.state.floorVariantData = JSON.stringify(floorVariants);

    // Setup pathfinding
    this.pathfinder = new Pathfinder(this.tileMap);

    // Setup systems
    this.aiSystem = new AISystem(this.pathfinder);
    this.combatSystem = new CombatSystem();
    this.spawnEnemies(rooms);

    // Register message handlers
    this.onMessage(MessageType.MOVE, this.handleMove.bind(this));

    // Game loop
    this.setSimulationInterval(this.update.bind(this), TICK_RATE);

    console.log("[DungeonRoom] Created with", rooms.length, "rooms");
  }

  onJoin(client: Client): void {
    console.log("[DungeonRoom] Player joined:", client.sessionId);

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

  onLeave(client: Client): void {
    console.log("[DungeonRoom] Player left:", client.sessionId);
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

    const target = entity.path[entity.currentPathIndex];
    const dx = target.x - entity.x;
    const dz = target.z - entity.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.15) {
      entity.currentPathIndex++;
      if (entity.currentPathIndex >= entity.path.length) {
        entity.isMoving = false;
      }
      return;
    }

    const ndx = dx / dist;
    const ndz = dz / dist;
    const step = Math.min(entity.speed * dt, dist);

    entity.x += ndx * step;
    entity.z += ndz * step;

    entity.rotY = Math.atan2(ndx, ndz);
  }

  private spawnEnemies(rooms: DungeonRoomDef[]): void {
    let enemyId = 0;
    // Skip first room (player spawn)
    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      const enemyCount = 1 + Math.floor(Math.random() * 2);

      for (let j = 0; j < enemyCount; j++) {
        const tileX = room.x + 1 + Math.floor(Math.random() * (room.w - 2));
        const tileY = room.y + 1 + Math.floor(Math.random() * (room.h - 2));

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

    console.log(`[DungeonRoom] Spawned ${enemyId} enemies`);
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
