import { Room, JWT } from "colyseus";
import type { Client, AuthContext } from "colyseus";
import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { createRoomLogger, pid } from "../logger";
import { getDb } from "../db/database";
import { accounts, characters } from "../db/schema";
import { DungeonState } from "../state/DungeonState";
import { PlayerState } from "../state/PlayerState";
import { EnemyState } from "../state/EnemyState";
import { GateState } from "../state/GateState";
import { DungeonGenerator } from "../dungeon/DungeonGenerator";
import type { Room as DungeonRoomDef } from "../dungeon/DungeonGenerator";
import { Pathfinder } from "../navigation/Pathfinder";
import { AISystem } from "../systems/AISystem";
import { CombatSystem } from "../systems/CombatSystem";
import { GateSystem } from "../systems/GateSystem";
import { GameLoop } from "../systems/GameLoop";
import { ChatSystem } from "../chat/ChatSystem";
import type { ChatRoomBridge } from "../chat/ChatSystem";
import { registerCommands } from "../chat/commands";
import { PlayerSessionManager } from "./PlayerSessionManager";
import {
  DUNGEON_WIDTH,
  DUNGEON_HEIGHT,
  DUNGEON_ROOMS,
  TILE_SIZE,
  type TileMap,
  MessageType,
  generateFloorVariants,
  generateWallVariants,
  assignRoomSets,
  ENEMY_TYPES,
  computeEnemyDerivedStats,
  scaleEnemyDerivedStats,
  GOLD_SAVE_INTERVAL,
  CloseCode,
} from "@dungeon/shared";
import type {
  MoveMessage,
  AdminRestartMessage,
  ChatSendPayload,
  PromoteLeaderMessage,
  PartyKickMessage,
} from "@dungeon/shared";
import { mulberry32 } from "@dungeon/shared";

const TICK_RATE = 64; // ms between simulation ticks

/** Fixed seed for deterministic dungeon generation (set to null for random). */
const DUNGEON_SEED: number | null = 42;

export class DungeonRoom extends Room<{ state: DungeonState }> {
  private pathfinder!: Pathfinder;
  private aiSystem!: AISystem;
  private combatSystem!: CombatSystem;
  private chatSystem!: ChatSystem;
  private gateSystem!: GateSystem;
  private gameLoop!: GameLoop;
  private sessionManager!: PlayerSessionManager;
  private tileMap!: TileMap;
  private log!: Logger;

  onCreate(): void {
    this.log = createRoomLogger(this.roomId);
    // Keep the room alive even when all players leave
    this.autoDispose = false;

    this.state = new DungeonState();

    // Generate dungeon (also creates pathfinder, AI, combat systems)
    const seed = DUNGEON_SEED ?? Date.now();
    this.generateDungeon(seed);

    // Setup chat system
    const self = this;
    const chatBridge: ChatRoomBridge = {
      getClients: () => this.clients,
      getPlayer: (sid) => this.state.players.get(sid),
      getPlayerRole: (c) => (c.auth as { role: string })?.role ?? "user",
      getPlayerName: (c) => {
        const p = this.state.players.get(c.sessionId);
        return p?.characterName || c.sessionId.slice(0, 6);
      },
      findPlayerByName: (name) => {
        const lower = name.toLowerCase();
        let result: { sessionId: string; player: PlayerState } | null = null;
        this.state.players.forEach((p: PlayerState, sid: string) => {
          if (p.characterName.toLowerCase() === lower) {
            result = { sessionId: sid, player: p };
          }
        });
        return result;
      },
      getAllPlayers: () => {
        const map = new Map<string, PlayerState>();
        this.state.players.forEach((p: PlayerState, sid: string) => map.set(sid, p));
        return map;
      },
      kickPlayer: (sessionId: string) => {
        this.sessionManager.markKicked(sessionId);
        this.sessionManager.removePlayerFromAllSystems(sessionId);
        this.sessionManager.reassignLeader();
      },
    };
    this.chatSystem = new ChatSystem(chatBridge);
    registerCommands(this.chatSystem, chatBridge);

    // Setup gate system (after dungeon + chat system are ready)
    this.gateSystem = new GateSystem({
      state: this.state,
      pathfinder: this.pathfinder,
      chatSystem: this.chatSystem,
      clock: this.clock,
    });

    // Setup session manager
    this.sessionManager = new PlayerSessionManager(
      {
        get state() {
          return self.state;
        },
        get clients() {
          return self.clients;
        },
        get tileMap() {
          return self.tileMap;
        },
        get combatSystem() {
          return self.combatSystem;
        },
        get aiSystem() {
          return self.aiSystem;
        },
        get chatSystem() {
          return self.chatSystem;
        },
        allowReconnection: (client, seconds) => self.allowReconnection(client, seconds),
        onSessionCleanup: (sessionId) => self.gameLoop?.removeDebugClient(sessionId),
      },
      this.log,
    );

    // Setup game loop
    this.gameLoop = new GameLoop({
      get state() {
        return self.state;
      },
      get aiSystem() {
        return self.aiSystem;
      },
      get combatSystem() {
        return self.combatSystem;
      },
      get chatSystem() {
        return self.chatSystem;
      },
      broadcastToAdmins: (type, message) => self.broadcastToAdmins(type, message),
      sendToClient: (sessionId, type, message) => {
        const client = self.clients.find((c) => c.sessionId === sessionId);
        if (client) client.send(type, message);
      },
      get clock() {
        return self.clock;
      },
    });

    // Register message handlers
    this.onMessage(MessageType.MOVE, this.handleMove.bind(this));
    this.onMessage(MessageType.ADMIN_RESTART, this.handleAdminRestart.bind(this));
    this.onMessage(MessageType.CHAT_SEND, (client: Client, data: ChatSendPayload) => {
      this.chatSystem.handleMessage(client, data.text);
    });
    // Client requests command list after setting up listeners
    this.onMessage(MessageType.CHAT_COMMANDS, (client: Client) => {
      const role = (client.auth as { role: string })?.role ?? "user";
      const commands = this.chatSystem.getCommandsForRole(role);
      client.send(MessageType.CHAT_COMMANDS, commands);
    });
    // Party: promote another player to leader (only current leader can do this)
    this.onMessage(MessageType.PROMOTE_LEADER, (client: Client, data: PromoteLeaderMessage) => {
      const sender = this.state.players.get(client.sessionId);
      if (!sender?.isLeader) return; // only leader can promote
      const target = this.state.players.get(data.targetSessionId);
      if (!target || data.targetSessionId === client.sessionId) return;
      // Transfer leadership
      this.state.players.forEach((p: PlayerState) => {
        p.isLeader = false;
      });
      target.isLeader = true;
      this.chatSystem.broadcastSystemI18n(
        "chat.leaderChanged",
        { name: target.characterName },
        `${target.characterName} is now the party leader.`,
      );
    });
    // Party: leader kicks a player
    this.onMessage(MessageType.PARTY_KICK, (client: Client, data: PartyKickMessage) => {
      const sender = this.state.players.get(client.sessionId);
      if (!sender?.isLeader) return; // only leader can kick
      const target = this.state.players.get(data.targetSessionId);
      if (!target || data.targetSessionId === client.sessionId) return; // can't kick yourself

      const targetName = target.characterName || data.targetSessionId.slice(0, 6);
      this.chatSystem.broadcastSystemI18n(
        "chat.kicked",
        { name: targetName },
        `${targetName} has been kicked.`,
      );

      this.sessionManager.markKicked(data.targetSessionId);
      const kickedClient = this.clients.find((c) => c.sessionId === data.targetSessionId);
      if (kickedClient) {
        kickedClient.leave(CloseCode.KICKED);
      }
      this.sessionManager.removePlayerFromAllSystems(data.targetSessionId);
      this.sessionManager.reassignLeader();
    });
    // Gate: leader opens a gate (with countdown for lobby type)
    this.onMessage(MessageType.GATE_INTERACT, (client: Client, data: { gateId: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (player) this.gateSystem.handleInteract(client, player, data);
    });
    // Debug: subscribe/unsubscribe to path visualization (admin-only)
    this.onMessage(MessageType.DEBUG_PATHS, (client: Client, data: { enabled: boolean }) => {
      const role = (client.auth as { role: string })?.role ?? "user";
      if (role !== "admin") return;
      this.gameLoop.setDebugPaths(client.sessionId, data.enabled);
    });

    // Auto-save gold for all players periodically
    this.clock.setInterval(() => {
      this.sessionManager.saveAllPlayersGold();
    }, GOLD_SAVE_INTERVAL);

    // Game loop
    this.setSimulationInterval(this.gameLoop.update.bind(this.gameLoop), TICK_RATE);
  }

  private generateDungeon(seed: number): void {
    this.state.dungeonSeed = seed;
    this.state.dungeonVersion++;

    // Calculate dungeon level from the leader's level (default 1 if no players yet)
    let dungeonLevel = 1;
    this.state.players.forEach((p: PlayerState) => {
      if (p.isLeader) dungeonLevel = Math.max(1, p.level);
    });
    this.state.dungeonLevel = dungeonLevel;
    const generator = new DungeonGenerator();
    this.tileMap = generator.generate(DUNGEON_WIDTH, DUNGEON_HEIGHT, DUNGEON_ROOMS, seed);

    // Clear existing gates
    this.state.gates.clear();

    // Create lobby gate from dungeon generator
    const gatePos = generator.getGatePosition();
    if (gatePos) {
      const gate = new GateState();
      gate.id = "lobby";
      gate.gateType = "lobby";
      gate.tileX = gatePos.x;
      gate.tileY = gatePos.y;
      gate.isNS = gatePos.isNS;
      gate.dir = gatePos.dir;
      gate.open = false;
      this.state.gates.set("lobby", gate);
    }

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

    // Setup pathfinding — block all closed gate tiles
    this.pathfinder = new Pathfinder(this.tileMap);
    this.state.gates.forEach((gate: GateState) => {
      if (!gate.open) this.pathfinder.blockTile(gate.tileX, gate.tileY);
    });

    // Setup AI + combat systems
    this.aiSystem = new AISystem(this.pathfinder);
    this.combatSystem = new CombatSystem();

    // Reset gate system with new dependencies (null on first call — created in onCreate after)
    this.gateSystem?.reset({
      state: this.state,
      pathfinder: this.pathfinder,
      chatSystem: this.chatSystem,
    });

    const spawnRng = mulberry32(seed ^ 0x454e454d);
    this.spawnEnemies(rooms, spawnRng, dungeonLevel);

    this.log.info(
      { seed, rooms: rooms.length, enemies: this.state.enemies.size },
      "Dungeon generated",
    );
  }

  private handleAdminRestart(client: Client, data: AdminRestartMessage): void {
    const auth = client.auth as { role: string };
    if (auth.role !== "admin") {
      this.log.warn({ player: pid(client.sessionId) }, "Non-admin tried to restart room");
      return;
    }

    const seed = data.seed ?? this.state.dungeonSeed;
    this.log.warn({ seed }, "Admin restart requested");

    // Clear all enemies
    this.state.enemies.clear();

    // Regenerate dungeon
    this.generateDungeon(seed);

    // Reset all connected players to spawn with full health
    const spawnPos = this.sessionManager.findSpawnPosition();
    this.state.players.forEach((player: PlayerState) => {
      player.health = player.maxHealth;
      player.isMoving = false;
      player.path = [];
      player.currentPathIndex = 0;
      if (spawnPos) {
        player.x = spawnPos.x;
        player.z = spawnPos.z;
      }
    });

    // Re-register existing players in combat system
    this.state.players.forEach((_player: PlayerState, sessionId: string) => {
      this.combatSystem.registerPlayer(sessionId);
    });

    this.chatSystem.broadcastSystemI18n(
      "chat.dungeonReshape",
      {},
      "The dungeon reshapes itself...",
    );
  }

  async onAuth(
    _client: Client,
    _options: unknown,
    context: AuthContext,
  ): Promise<{
    accountId: string;
    characterId: string;
    characterName: string;
    role: string;
    strength: number;
    vitality: number;
    agility: number;
    level: number;
    gold: number;
  }> {
    if (!context.token) throw new Error("No auth token provided");

    const payload = (await JWT.verify(context.token)) as { accountId?: string };
    if (!payload?.accountId) throw new Error("Invalid token payload");

    const db = getDb();
    const [account] = await db
      .select({ id: accounts.id, role: accounts.role })
      .from(accounts)
      .where(eq(accounts.id, payload.accountId))
      .limit(1);
    if (!account) throw new Error("Account not found");

    // Load first character with stats (v1: one character per account)
    const [character] = await db
      .select({
        id: characters.id,
        name: characters.name,
        strength: characters.strength,
        vitality: characters.vitality,
        agility: characters.agility,
        level: characters.level,
        gold: characters.gold,
      })
      .from(characters)
      .where(eq(characters.accountId, account.id))
      .limit(1);
    if (!character) throw new Error("No character found");

    // Block new players if the dungeon has already started (lobby gate open)
    // Allow returning players (account already has a disconnected player in the room)
    if (this.isDungeonStarted()) {
      const oldSessionId = this.sessionManager.getSessionForAccount(account.id);
      const existingPlayer = oldSessionId ? this.state.players.get(oldSessionId) : undefined;
      if (!existingPlayer) {
        throw new Error("DUNGEON_STARTED");
      }
    }

    return {
      accountId: account.id,
      characterId: character.id,
      characterName: character.name,
      role: account.role,
      strength: character.strength,
      vitality: character.vitality,
      agility: character.agility,
      level: character.level,
      gold: character.gold,
    };
  }

  onJoin(client: Client): void {
    this.sessionManager.handleJoin(client);
  }

  async onDrop(client: Client): Promise<void> {
    await this.sessionManager.handleDrop(client);
  }

  onReconnect(client: Client): void {
    this.sessionManager.handleReconnect(client);
  }

  onLeave(client: Client): void {
    this.sessionManager.handleLeave(client);
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

  private spawnEnemies(rooms: DungeonRoomDef[], rng: () => number, dungeonLevel: number): void {
    const typeDef = ENEMY_TYPES.zombie;
    const baseDerived = computeEnemyDerivedStats(typeDef);

    let enemyId = 0;
    // Skip first room (player spawn)
    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      const enemyCount = 1 + Math.floor(rng() * 2);

      for (let j = 0; j < enemyCount; j++) {
        const tileX = room.x + 1 + Math.floor(rng() * (room.w - 2));
        const tileY = room.y + 1 + Math.floor(rng() * (room.h - 2));

        // Assign enemy level in range [dungeonLevel - 1, dungeonLevel + 2] (min 1)
        const levelOffset = Math.floor(rng() * 4) - 1; // -1 to +2
        const enemyLevel = Math.max(1, dungeonLevel + levelOffset);

        // Scale stats based on enemy level
        const derived = scaleEnemyDerivedStats(baseDerived, enemyLevel);

        const enemy = new EnemyState();
        enemy.x = tileX * TILE_SIZE;
        enemy.z = tileY * TILE_SIZE;
        enemy.enemyType = typeDef.id;
        enemy.level = enemyLevel;
        enemy.maxHealth = derived.maxHealth;
        enemy.health = derived.maxHealth;
        enemy.speed = derived.moveSpeed;
        enemy.attackDamage = derived.attackDamage;
        enemy.defense = derived.defense;
        enemy.attackCooldown = derived.attackCooldown;
        enemy.attackRange = derived.attackRange;
        enemy.detectionRange = typeDef.detectionRange;

        const id = `enemy_${enemyId++}`;
        this.state.enemies.set(id, enemy);
        this.aiSystem.register(enemy, id, typeDef.leashRange);
      }
    }
  }

  /** Returns true if the lobby gate has been opened (dungeon expedition active) */
  private isDungeonStarted(): boolean {
    const lobbyGate = this.state.gates.get("lobby");
    return lobbyGate ? lobbyGate.open : false;
  }

  /** Send a message only to clients with admin role */
  private broadcastToAdmins(type: string, message: unknown): void {
    for (const client of this.clients) {
      const auth = client.auth as { role?: string } | undefined;
      if (auth?.role === "admin") {
        client.send(type, message);
      }
    }
  }
}
