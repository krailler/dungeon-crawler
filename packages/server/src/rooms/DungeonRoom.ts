import { Room, JWT } from "colyseus";
import type { Client, AuthContext } from "colyseus";
import { StateView } from "@colyseus/schema";
import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { createRoomLogger } from "../logger";
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
import { resetTutorials } from "../tutorials/resetTutorials";
import { PlayerSessionManager } from "./PlayerSessionManager";
import { getItemDef, getItemDefs, getItemRegistryVersion } from "../items/ItemRegistry";
import { executeEffect } from "../items/EffectHandlers";
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
  GOLD_SAVE_INTERVAL,
  CloseCode,
  SkillId,
  Role,
  GateType,
  MIN_PROTOCOL_VERSION,
  TutorialStep,
  ALLOCATABLE_STATS,
} from "@dungeon/shared";
import type {
  MoveMessage,
  AdminRestartMessage,
  ChatSendPayload,
  PromoteLeaderMessage,
  PartyKickMessage,
  SkillIdValue,
  AllocatableStatValue,
  TutorialDismissMessage,
  StatAllocateMessage,
  SprintMessage,
  AdminDebugInfoMessage,
  ItemUseMessage,
  ItemDefsRequestMessage,
} from "@dungeon/shared";
import { mulberry32, generateRoomName } from "@dungeon/shared";

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

  /** Send a message to a specific client by session ID. */
  private sendToClient = (sessionId: string, type: string, message: unknown): void => {
    const c = this.clients.find((cl) => cl.sessionId === sessionId);
    if (c) c.send(type, message);
  };

  onCreate(): void {
    this.log = createRoomLogger(this.roomId);
    // Keep the room alive even when all players leave
    this.autoDispose = false;

    this.state = new DungeonState();
    this.state.serverRuntime = `Bun ${Bun.version} (${process.arch})`;

    // Generate dungeon (also creates pathfinder, AI, combat systems)
    const seed = DUNGEON_SEED ?? Date.now();
    this.generateDungeon(seed);

    // Setup chat system
    const self = this;
    const chatBridge: ChatRoomBridge = {
      getClients: () => this.clients,
      getPlayer: (sid) => this.state.players.get(sid),
      getPlayerRole: (c) => (c.auth as { role: string })?.role ?? Role.USER,
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
      sendToClient: this.sendToClient,
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
      log: this.log,
      sendToClient: this.sendToClient,
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
        get clock() {
          return self.clock;
        },
        sendToClient: this.sendToClient,
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
      get tileMap() {
        return self.tileMap;
      },
      get pathfinder() {
        return self.pathfinder;
      },
      broadcastToAdmins: (type, message) => self.broadcastToAdmins(type, message),
      sendToClient: this.sendToClient,
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
      const role = (client.auth as { role: string })?.role ?? Role.USER;
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
    // Skill toggle: enable/disable a skill (e.g. auto-attack)
    this.onMessage(MessageType.SKILL_TOGGLE, (client: Client, data: { skillId: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (data.skillId === SkillId.BASIC_ATTACK) {
        player.autoAttackEnabled = !player.autoAttackEnabled;
      }
    });
    // Skill use: activate an active skill (e.g. heavy strike)
    this.onMessage(MessageType.SKILL_USE, (client: Client, data: { skillId: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      // Build enemies map for combat system
      const enemiesMap = new Map<string, EnemyState>();
      this.state.enemies.forEach((e: EnemyState, id: string) => enemiesMap.set(id, e));
      const result = this.combatSystem.useSkill(
        client.sessionId,
        data.skillId as SkillIdValue,
        player,
        enemiesMap,
      );
      if (result) {
        client.send(MessageType.SKILL_COOLDOWN, {
          skillId: result.skillId,
          duration: result.duration,
          remaining: result.remaining,
        });
      }
    });
    // Tutorial: player dismisses a tutorial hint
    this.onMessage(MessageType.TUTORIAL_DISMISS, (client: Client, data: TutorialDismissMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      player.tutorialsCompleted.add(data.step);
    });
    // Tutorial: player resets all their tutorials
    this.onMessage(MessageType.TUTORIAL_RESET, (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      resetTutorials(player, client.sessionId, (_sid, type, msg) => {
        client.send(type, msg);
      });
    });
    // Stats: allocate a stat point to a base stat
    this.onMessage(MessageType.STAT_ALLOCATE, (client: Client, data: StatAllocateMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (!ALLOCATABLE_STATS.includes(data.stat as AllocatableStatValue)) return;
      if (player.allocateStat(data.stat)) {
        // Auto-complete the allocate stats tutorial
        player.tutorialsCompleted.add(TutorialStep.ALLOCATE_STATS);
      }
    });
    this.onMessage(MessageType.SPRINT, (client: Client, data: SprintMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health <= 0) return;
      player.sprintRequested = data.active;
    });

    // Item use: consume an item from inventory
    this.onMessage(MessageType.ITEM_USE, (client: Client, data: ItemUseMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.health <= 0) return;

      const def = getItemDef(data.itemId);
      if (!def || !def.consumable) return;

      // Check cooldown
      const cd = player.itemCooldowns.get(data.itemId);
      if (cd && cd > 0) return;

      // Check player has the item
      if (player.countItem(data.itemId) <= 0) return;

      // Execute effect
      const success = executeEffect(def.effectType, player, def.effectParams);
      if (!success) return;

      // Consume one
      player.removeItem(data.itemId, 1);

      // Set cooldown
      if (def.cooldown > 0) {
        player.itemCooldowns.set(data.itemId, def.cooldown);
        client.send(MessageType.ITEM_COOLDOWN, {
          itemId: data.itemId,
          duration: def.cooldown,
        });
      }
    });

    // Item definitions: client requests defs lazily by id
    this.onMessage(
      MessageType.ITEM_DEFS_REQUEST,
      (client: Client, data: ItemDefsRequestMessage) => {
        if (!Array.isArray(data.itemIds) || data.itemIds.length === 0) return;
        // Cap to prevent abuse
        const ids = data.itemIds.slice(0, 50);
        client.send(MessageType.ITEM_DEFS_RESPONSE, {
          version: getItemRegistryVersion(),
          items: getItemDefs(ids),
        });
      },
    );

    // Debug: subscribe/unsubscribe to path visualization (admin-only)
    this.onMessage(MessageType.DEBUG_PATHS, (client: Client, data: { enabled: boolean }) => {
      const role = (client.auth as { role: string })?.role ?? Role.USER;
      if (role !== Role.ADMIN) return;
      this.gameLoop.setDebugPaths(client.sessionId, data.enabled);
    });

    // Auto-save gold for all players periodically
    this.clock.setInterval(() => {
      this.sessionManager.saveAllPlayersProgress();
    }, GOLD_SAVE_INTERVAL);

    // Game loop
    this.setSimulationInterval(this.gameLoop.update.bind(this.gameLoop), TICK_RATE);
  }

  private generateDungeon(seed: number): void {
    this.state.dungeonSeed = seed;
    this.state.roomName = generateRoomName(seed);
    this.state.dungeonVersion++;

    // Calculate dungeon level from average party level (default 1 if no players yet)
    let levelSum = 0;
    let playerCount = 0;
    this.state.players.forEach((p: PlayerState) => {
      levelSum += p.level;
      playerCount++;
    });
    const dungeonLevel = playerCount > 0 ? Math.max(1, Math.round(levelSum / playerCount)) : 1;
    this.state.dungeonLevel = dungeonLevel;
    const generator = new DungeonGenerator();
    this.tileMap = generator.generate(DUNGEON_WIDTH, DUNGEON_HEIGHT, DUNGEON_ROOMS, seed);

    // Clear existing gates
    this.state.gates.clear();

    // Create lobby gates — one per corridor exit from the spawn room.
    // Opening any of them opens all (handled by GateSystem).
    const gatePositions = generator.getGatePositions();
    for (let i = 0; i < gatePositions.length; i++) {
      const pos = gatePositions[i];
      const gate = new GateState();
      const gateId = `lobby_${i}`;
      gate.id = gateId;
      gate.gateType = GateType.LOBBY;
      gate.tileX = pos.x;
      gate.tileY = pos.y;
      gate.isNS = pos.isNS;
      gate.dir = pos.dir;
      gate.open = false;
      this.state.gates.set(gateId, gate);
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
    if (auth.role !== Role.ADMIN) {
      this.log.warn({ player: client.sessionId }, "Non-admin tried to restart room");
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
    options: { protocolVersion?: number },
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
    xp: number;
    statPoints: number;
    tutorialsCompleted: string;
  }> {
    // Check client protocol version
    const clientVersion = options?.protocolVersion ?? 0;
    if (clientVersion < MIN_PROTOCOL_VERSION) {
      this.log.warn(
        { clientVersion, minVersion: MIN_PROTOCOL_VERSION },
        "Rejected client — outdated version",
      );
      throw new Error("VERSION_MISMATCH");
    }

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
        xp: characters.xp,
        statPoints: characters.statPoints,
        tutorialsCompleted: characters.tutorialsCompleted,
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
        this.log.warn({ accountId: account.id }, "Rejected join — dungeon already started");
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
      xp: character.xp,
      statPoints: character.statPoints,
      tutorialsCompleted: character.tutorialsCompleted,
    };
  }

  onJoin(client: Client): void {
    this.sessionManager.handleJoin(client);
    // Create a StateView for this client and add their secret state
    const player = this.state.players.get(client.sessionId);
    if (player) {
      if (!client.view) {
        client.view = new StateView();
      }
      client.view.add(player.secret);
    }

    // Recalculate dungeon level when the first player joins (dungeon was generated empty)
    if (this.state.players.size === 1 && !this.isDungeonStarted()) {
      this.recalcDungeonLevel();
    }

    // No longer push all item defs — client requests them lazily via ITEM_DEFS_REQUEST

    // Send debug info to admin clients
    const auth = client.auth as { role?: string } | undefined;
    if (auth?.role === Role.ADMIN) {
      client.send(MessageType.ADMIN_DEBUG_INFO, {
        seed: this.state.dungeonSeed,
        tickRate: this.state.tickRate,
        runtime: this.state.serverRuntime,
      } satisfies AdminDebugInfoMessage);
    }
  }

  async onDrop(client: Client): Promise<void> {
    if (this.isDungeonStarted()) {
      await this.sessionManager.handleDrop(client);
    } else {
      this.sessionManager.handleLeave(client);
    }
  }

  onReconnect(client: Client): void {
    this.sessionManager.handleReconnect(client);
    // Re-create the view and add secret state after reconnect
    const player = this.state.players.get(client.sessionId);
    if (player) {
      if (!client.view) {
        client.view = new StateView();
      }
      client.view.add(player.secret);
    }
  }

  onLeave(client: Client): void {
    // During an active dungeon, treat a consented leave (tab close / page reload)
    // as a soft disconnect: keep the player offline so the same account can
    // rejoin via session migration in onAuth/handleJoin.
    // NOTE: we do NOT call handleDrop here because allowReconnection() only
    // works inside onDrop. From onLeave it can reject immediately, which
    // removes the player state before the new connection arrives.
    if (this.isDungeonStarted()) {
      this.sessionManager.handleConsentedLeaveDuringDungeon(client);
      return;
    }
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
      // More enemies per room at higher dungeon levels
      const minEnemies = 1 + Math.floor(dungeonLevel / 10);
      const enemyCount = minEnemies + Math.floor(rng() * 2);

      for (let j = 0; j < enemyCount; j++) {
        const tileX = room.x + 1 + Math.floor(rng() * (room.w - 2));
        const tileY = room.y + 1 + Math.floor(rng() * (room.h - 2));

        // Assign enemy level in range [dungeonLevel - 1, dungeonLevel + 2] (min 1)
        const levelOffset = Math.floor(rng() * 4) - 1; // -1 to +2
        const enemyLevel = Math.max(1, dungeonLevel + levelOffset);

        const enemy = new EnemyState();
        enemy.x = tileX * TILE_SIZE;
        enemy.z = tileY * TILE_SIZE;
        enemy.enemyType = typeDef.id;
        enemy.detectionRange = typeDef.detectionRange;
        enemy.applyStats(baseDerived, enemyLevel);

        const id = `enemy_${enemyId++}`;
        this.state.enemies.set(id, enemy);
        this.aiSystem.register(enemy, id, typeDef.leashRange);
      }
    }
  }

  /** Recalculate dungeon level from current party and re-scale all enemies */
  private recalcDungeonLevel(): void {
    let levelSum = 0;
    let playerCount = 0;
    this.state.players.forEach((p: PlayerState) => {
      levelSum += p.level;
      playerCount++;
    });
    const newLevel = playerCount > 0 ? Math.max(1, Math.round(levelSum / playerCount)) : 1;
    if (newLevel === this.state.dungeonLevel) return;

    const oldLevel = this.state.dungeonLevel;
    this.state.dungeonLevel = newLevel;

    // Re-scale all existing enemies to match the new dungeon level
    const typeDef = ENEMY_TYPES.zombie;
    const baseDerived = computeEnemyDerivedStats(typeDef);
    this.state.enemies.forEach((enemy: EnemyState) => {
      const levelOffset = enemy.level - oldLevel;
      const enemyLevel = Math.max(1, newLevel + levelOffset);
      enemy.applyStats(baseDerived, enemyLevel);
    });

    this.log.info({ dungeonLevel: newLevel, playerCount }, "Recalculated dungeon level");
  }

  /** Returns true if any lobby gate has been opened (dungeon expedition active) */
  private isDungeonStarted(): boolean {
    let started = false;
    this.state.gates.forEach((gate: GateState) => {
      if (gate.gateType === GateType.LOBBY && gate.open) started = true;
    });
    return started;
  }

  /** Send a message only to clients with admin role */
  private broadcastToAdmins(type: string, message: unknown): void {
    for (const client of this.clients) {
      const auth = client.auth as { role?: string } | undefined;
      if (auth?.role === Role.ADMIN) {
        client.send(type, message);
      }
    }
  }
}
