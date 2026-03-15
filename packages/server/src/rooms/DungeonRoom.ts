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
import { ChatSystem } from "../chat/ChatSystem";
import type { ChatRoomBridge } from "../chat/ChatSystem";
import { registerCommands } from "../chat/commands";
import {
  DUNGEON_WIDTH,
  DUNGEON_HEIGHT,
  DUNGEON_ROOMS,
  TILE_SIZE,
  TileType,
  type TileMap,
  MessageType,
  generateFloorVariants,
  generateWallVariants,
  assignRoomSets,
  computeDerivedStats,
  ENEMY_TYPES,
  computeEnemyDerivedStats,
  GATE_INTERACT_RANGE,
  GATE_COUNTDOWN_SECONDS,
  CloseCode,
} from "@dungeon/shared";
import type {
  MoveMessage,
  AdminRestartMessage,
  CombatLogMessage,
  ChatSendPayload,
  PromoteLeaderMessage,
  GateInteractMessage,
  PartyKickMessage,
  DebugPathEntry,
} from "@dungeon/shared";
import { mulberry32 } from "@dungeon/shared";
import {
  registerSession,
  unregisterSession,
  isActiveSession,
} from "../sessions/activeSessionRegistry";

const TICK_RATE = 64; // ms between simulation ticks
const RECONNECT_TIMEOUT = 120; // seconds
/** Remaining seconds at which to send reconnection warnings */
const RECONNECT_WARNINGS = [30, 10];

/** Fixed seed for deterministic dungeon generation (set to null for random). */
const DUNGEON_SEED: number | null = 42;

export class DungeonRoom extends Room<{ state: DungeonState }> {
  private pathfinder!: Pathfinder;
  private aiSystem!: AISystem;
  private combatSystem!: CombatSystem;
  private chatSystem!: ChatSystem;
  private tileMap!: TileMap;
  private log!: Logger;
  private lastTickTime: number = 0;
  private tickAccum: number = 0;
  private tickCount: number = 0;
  /** Sessions kicked via /kick — skip reconnection in onDrop */
  private kickedSessions: Set<string> = new Set();
  /** Pending reconnection warning timers — cancelled on reconnect */
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>[]> = new Map();
  /** Maps accountId → sessionId so we can find a disconnected player on re-login */
  private accountToSession: Map<string, string> = new Map();
  /** Clients subscribed to debug path visualization */
  private debugPathClients: Set<string> = new Set();
  /** Gate ids with an active countdown in progress */
  private gateCountdowns: Set<string> = new Set();
  // Pre-allocated maps reused each tick to avoid GC pressure
  private tickPlayersMap: Map<string, PlayerState> = new Map();
  private tickEnemiesMap: Map<string, EnemyState> = new Map();

  onCreate(): void {
    this.log = createRoomLogger(this.roomId);
    // Keep the room alive even when all players leave
    this.autoDispose = false;

    this.state = new DungeonState();

    // Generate dungeon
    const seed = DUNGEON_SEED ?? Date.now();
    this.generateDungeon(seed);

    // Setup chat system
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
        this.kickedSessions.add(sessionId);
        // Clean account mapping for the kicked session
        const kickedClient = this.clients.find((c) => c.sessionId === sessionId);
        if (kickedClient) {
          const kickAuth = kickedClient.auth as { accountId?: string } | undefined;
          if (kickAuth?.accountId) this.accountToSession.delete(kickAuth.accountId);
        }
        this.state.players.delete(sessionId);
        this.combatSystem.removePlayer(sessionId);
        this.aiSystem.removePlayer(sessionId);
        this.chatSystem.removePlayer(sessionId);
        this.reassignLeader();
      },
    };
    this.chatSystem = new ChatSystem(chatBridge);
    registerCommands(this.chatSystem, chatBridge);

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

      // Reuse the same kick logic as /kick command
      this.kickedSessions.add(data.targetSessionId);
      const kickedClient = this.clients.find((c) => c.sessionId === data.targetSessionId);
      if (kickedClient) {
        const kickAuth = kickedClient.auth as { accountId?: string } | undefined;
        if (kickAuth?.accountId) this.accountToSession.delete(kickAuth.accountId);
        kickedClient.leave(CloseCode.KICKED);
      }
      this.state.players.delete(data.targetSessionId);
      this.combatSystem.removePlayer(data.targetSessionId);
      this.aiSystem.removePlayer(data.targetSessionId);
      this.chatSystem.removePlayer(data.targetSessionId);
      this.reassignLeader();
    });
    // Gate: leader opens a gate (with countdown for lobby type)
    this.onMessage(MessageType.GATE_INTERACT, (client: Client, data: GateInteractMessage) => {
      const gate = this.state.gates.get(data.gateId);
      if (!gate || gate.open || this.gateCountdowns.has(data.gateId)) return;
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Lobby gates require leader
      if (gate.gateType === "lobby" && !player.isLeader) {
        this.chatSystem.sendToClientI18n(
          client,
          "message",
          "chat.gateLeaderOnly",
          {},
          "Only the party leader can open the gate.",
          "error",
        );
        return;
      }

      // Check proximity
      const gateWX = gate.tileX * TILE_SIZE;
      const gateWZ = gate.tileY * TILE_SIZE;
      const dx = player.x - gateWX;
      const dz = player.z - gateWZ;
      if (dx * dx + dz * dz > GATE_INTERACT_RANGE * GATE_INTERACT_RANGE) return;

      // Lobby gates use countdown; other types open immediately
      if (gate.gateType === "lobby") {
        this.gateCountdowns.add(data.gateId);
        const leaderName = player.characterName || client.sessionId.slice(0, 6);
        this.chatSystem.broadcastAnnouncement(
          "announce.gateCountdownStart",
          { name: leaderName, seconds: GATE_COUNTDOWN_SECONDS },
          `${leaderName} is opening the gate... ${GATE_COUNTDOWN_SECONDS}`,
        );

        for (let s = GATE_COUNTDOWN_SECONDS - 1; s >= 1; s--) {
          this.clock.setTimeout(
            () => {
              if (gate.open) return;
              this.chatSystem.broadcastAnnouncement(
                "announce.gateCountdownStart",
                { name: leaderName, seconds: s },
                `${leaderName} is opening the gate... ${s}`,
              );
            },
            (GATE_COUNTDOWN_SECONDS - s) * 1000,
          );
        }

        this.clock.setTimeout(() => {
          if (gate.open) return;
          gate.open = true;
          this.gateCountdowns.delete(data.gateId);
          this.pathfinder.unblockTile(gate.tileX, gate.tileY);
          this.chatSystem.broadcastAnnouncement(
            "announce.gateOpened",
            {},
            "The gate opens... The dungeon awaits!",
          );
        }, GATE_COUNTDOWN_SECONDS * 1000);
      } else {
        // Non-lobby gates open immediately
        gate.open = true;
        this.pathfinder.unblockTile(gate.tileX, gate.tileY);
      }
    });
    // Debug: subscribe/unsubscribe to path visualization (admin-only)
    this.onMessage(MessageType.DEBUG_PATHS, (client: Client, data: { enabled: boolean }) => {
      const role = (client.auth as { role: string })?.role ?? "user";
      if (role !== "admin") return;
      if (data.enabled) {
        this.debugPathClients.add(client.sessionId);
      } else {
        this.debugPathClients.delete(client.sessionId);
      }
    });

    // Game loop
    this.setSimulationInterval(this.update.bind(this), TICK_RATE);
  }

  private generateDungeon(seed: number): void {
    this.state.dungeonSeed = seed;
    this.state.dungeonVersion++;
    const generator = new DungeonGenerator();
    this.tileMap = generator.generate(DUNGEON_WIDTH, DUNGEON_HEIGHT, DUNGEON_ROOMS, seed);

    // Clear existing gates
    this.state.gates.clear();
    this.gateCountdowns.clear();

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
    const spawnRng = mulberry32(seed ^ 0x454e454d);
    this.spawnEnemies(rooms, spawnRng);

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
    const spawnPos = this.findSpawnPosition();
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
      })
      .from(characters)
      .where(eq(characters.accountId, account.id))
      .limit(1);
    if (!character) throw new Error("No character found");

    return {
      accountId: account.id,
      characterId: character.id,
      characterName: character.name,
      role: account.role,
      strength: character.strength,
      vitality: character.vitality,
      agility: character.agility,
      level: character.level,
    };
  }

  onJoin(client: Client): void {
    const { accountId, characterName, role, strength, vitality, agility, level } = client.auth as {
      accountId: string;
      characterId: string;
      characterName: string;
      role: string;
      strength: number;
      vitality: number;
      agility: number;
      level: number;
    };

    // Kick previous session if same account is already connected (any room)
    registerSession(accountId, client);

    this.log.info(
      { player: pid(client.sessionId), accountId, characterName, role },
      "Player joined",
    );

    // Check if this account already has a disconnected player in this room
    const oldSessionId = this.accountToSession.get(accountId);
    const existingPlayer = oldSessionId ? this.state.players.get(oldSessionId) : undefined;

    if (existingPlayer && oldSessionId && oldSessionId !== client.sessionId) {
      // Migrate existing player state to the new session
      this.log.info(
        { player: pid(client.sessionId), oldSession: pid(oldSessionId) },
        "Migrating player state from old session",
      );

      // Clean up old session references
      this.clearReconnectTimers(oldSessionId);
      this.state.players.delete(oldSessionId);
      this.combatSystem.removePlayer(oldSessionId);
      this.aiSystem.removePlayer(oldSessionId);
      this.chatSystem.removePlayer(oldSessionId);

      // Revive the player under the new session
      existingPlayer.online = true;
      existingPlayer.isMoving = false;
      existingPlayer.path = [];
      existingPlayer.currentPathIndex = 0;
      existingPlayer.role = role;

      this.state.players.set(client.sessionId, existingPlayer);
      this.combatSystem.registerPlayer(client.sessionId);
      this.accountToSession.set(accountId, client.sessionId);
      this.reassignLeader();

      // Chat: broadcast reconnect event
      this.chatSystem.broadcastSystemI18n(
        "chat.reconnected",
        { name: characterName },
        `${characterName} reconnected.`,
      );
      return;
    }

    // Brand new player — create fresh state
    const player = new PlayerState();
    player.characterName = characterName;
    player.role = role;

    // Apply base stats from DB
    player.strength = strength;
    player.vitality = vitality;
    player.agility = agility;
    player.level = level;

    // Compute derived stats
    const derived = computeDerivedStats({ strength, vitality, agility });
    player.maxHealth = derived.maxHealth;
    player.health = derived.maxHealth;
    player.speed = derived.moveSpeed;
    player.attackDamage = derived.attackDamage;
    player.defense = derived.defense;
    player.attackCooldown = derived.attackCooldown;
    player.attackRange = derived.attackRange;

    // Find spawn position
    const spawnPos = this.findSpawnPosition();
    if (spawnPos) {
      player.x = spawnPos.x;
      player.z = spawnPos.z;
    }
    player.rotY = Math.PI;

    this.state.players.set(client.sessionId, player);
    this.combatSystem.registerPlayer(client.sessionId);
    this.accountToSession.set(accountId, client.sessionId);
    this.reassignLeader();

    // Chat: broadcast join event
    this.chatSystem.broadcastSystemI18n(
      "chat.joined",
      { name: characterName },
      `${characterName} joined the dungeon.`,
    );
  }

  async onDrop(client: Client): Promise<void> {
    const auth = client.auth as { accountId?: string } | undefined;

    // If this client was kicked via /kick, state already cleaned up — just unregister
    if (this.kickedSessions.has(client.sessionId)) {
      this.kickedSessions.delete(client.sessionId);
      this.log.info(
        { player: pid(client.sessionId) },
        "Kicked player dropped — skipping reconnect",
      );
      this.unregisterClient(client);
      return;
    }

    // If this client was kicked (replaced by a new session), clean up immediately
    if (auth?.accountId && !isActiveSession(auth.accountId, client)) {
      this.log.info(
        { player: pid(client.sessionId) },
        "Kicked session dropped — removing immediately",
      );
      this.clearReconnectTimers(client.sessionId);
      this.state.players.delete(client.sessionId);
      this.combatSystem.removePlayer(client.sessionId);
      this.aiSystem.removePlayer(client.sessionId);
      this.chatSystem.removePlayer(client.sessionId);
      this.reassignLeader();
      return;
    }

    this.log.warn({ player: pid(client.sessionId) }, "Player dropped — waiting 120s for reconnect");

    // Stop the player while disconnected
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.isMoving = false;
      player.online = false;
      player.path = [];
      player.currentPathIndex = 0;
      this.chatSystem.broadcastSystemI18n(
        "chat.disconnectedWithTime",
        { name: player.characterName, seconds: RECONNECT_TIMEOUT },
        `${player.characterName} disconnected. ${RECONNECT_TIMEOUT}s to reconnect.`,
      );
    }

    // Schedule warning timers
    const timers: ReturnType<typeof setTimeout>[] = [];
    const playerName = player?.characterName || client.sessionId.slice(0, 6);
    for (const remaining of RECONNECT_WARNINGS) {
      const delay = (RECONNECT_TIMEOUT - remaining) * 1000;
      timers.push(
        setTimeout(() => {
          this.chatSystem.broadcastSystemI18n(
            "chat.reconnectWarning",
            { name: playerName, seconds: remaining },
            `${playerName} has ${remaining}s to reconnect.`,
          );
        }, delay),
      );
    }
    this.reconnectTimers.set(client.sessionId, timers);

    // Allow reconnection
    try {
      await this.allowReconnection(client, RECONNECT_TIMEOUT);
    } catch {
      // Reconnection timed out — remove player
      this.log.info({ player: pid(client.sessionId) }, "Reconnection timed out — player removed");
      this.clearReconnectTimers(client.sessionId);
      this.chatSystem.broadcastSystemI18n(
        "chat.reconnectExpired",
        { name: playerName },
        `${playerName} failed to reconnect and has been removed.`,
      );
      this.state.players.delete(client.sessionId);
      this.combatSystem.removePlayer(client.sessionId);
      this.aiSystem.removePlayer(client.sessionId);
      this.removeAccountMapping(client);
      this.unregisterClient(client);
      this.reassignLeader();
    }
  }

  onReconnect(client: Client): void {
    this.log.info({ player: pid(client.sessionId) }, "Player reconnected");
    this.clearReconnectTimers(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.online = true;
      this.chatSystem.broadcastSystemI18n(
        "chat.reconnected",
        { name: player.characterName },
        `${player.characterName} reconnected.`,
      );
    }
  }

  onLeave(client: Client): void {
    const player = this.state.players.get(client.sessionId);
    const name = player?.characterName || client.sessionId.slice(0, 6);
    this.log.info({ player: pid(client.sessionId) }, "Player left");
    this.state.players.delete(client.sessionId);
    this.combatSystem.removePlayer(client.sessionId);
    this.aiSystem.removePlayer(client.sessionId);
    this.chatSystem.removePlayer(client.sessionId);
    this.removeAccountMapping(client);
    this.unregisterClient(client);
    this.reassignLeader();
    this.chatSystem.broadcastSystemI18n("chat.left", { name }, `${name} left the dungeon.`);
  }

  /** Remove the accountId→sessionId mapping (only if it still points to this session) */
  private removeAccountMapping(client: Client): void {
    const auth = client.auth as { accountId?: string } | undefined;
    if (auth?.accountId && this.accountToSession.get(auth.accountId) === client.sessionId) {
      this.accountToSession.delete(auth.accountId);
    }
    this.debugPathClients.delete(client.sessionId);
  }

  private clearReconnectTimers(sessionId: string): void {
    const timers = this.reconnectTimers.get(sessionId);
    if (timers) {
      for (const t of timers) clearTimeout(t);
      this.reconnectTimers.delete(sessionId);
    }
  }

  private unregisterClient(client: Client): void {
    const auth = client.auth as { accountId?: string } | undefined;
    if (auth?.accountId) {
      unregisterSession(auth.accountId, client);
    }
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
    const now = performance.now();
    if (this.lastTickTime > 0) {
      this.tickAccum += now - this.lastTickTime;
      this.tickCount++;
      if (this.tickAccum >= 1000) {
        this.state.tickRate = Math.round((this.tickCount / this.tickAccum) * 1000);
        this.tickAccum = 0;
        this.tickCount = 0;
      }
    }
    this.lastTickTime = now;

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
    this.tickPlayersMap.clear();
    this.state.players.forEach((player: PlayerState, sessionId: string) => {
      this.tickPlayersMap.set(sessionId, player);
    });

    this.aiSystem.update(
      dtSec,
      this.tickPlayersMap,
      (sessionId, damage) => {
        const player = this.state.players.get(sessionId);
        if (!player) return;
        player.health -= damage;
        if (player.health < 0) player.health = 0;
        if (player.health <= 0) {
          const name = player.characterName || sessionId.slice(0, 6);
          this.chatSystem.broadcastSystemI18n("chat.slain", { name }, `${name} has been slain!`);
        }
      },
      (event) => {
        const enemy = this.state.enemies.get(event.enemyId);
        const player = this.state.players.get(event.sessionId);
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
        this.broadcastToAdmins(MessageType.COMBAT_LOG, msg);
      },
    );

    // Combat system: player auto-attack
    this.tickEnemiesMap.clear();
    this.state.enemies.forEach((enemy: EnemyState, id: string) => {
      this.tickEnemiesMap.set(id, enemy);
    });

    this.combatSystem.update(dtSec, this.tickPlayersMap, this.tickEnemiesMap, (event) => {
      // Player hit generates threat on the enemy
      this.aiSystem.addThreat(event.enemyId, event.sessionId, event.finalDamage);

      const player = this.state.players.get(event.sessionId);
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
      this.broadcastToAdmins(MessageType.COMBAT_LOG, msg);

      // Remove dead enemy from state after a short delay so clients see the death
      if (event.killed) {
        this.clock.setTimeout(() => {
          this.state.enemies.delete(event.enemyId);
          this.aiSystem.unregister(event.enemyId);
        }, 1000);
      }
    });

    // Debug: send path data to subscribed admin clients
    if (this.debugPathClients.size > 0) {
      this.sendDebugPaths();
    }
  }

  private sendDebugPaths(): void {
    const paths: DebugPathEntry[] = [];

    this.state.players.forEach((player: PlayerState, sessionId: string) => {
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

    this.state.enemies.forEach((enemy: EnemyState, enemyId: string) => {
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
      const client = this.clients.find((c) => c.sessionId === sessionId);
      if (client) {
        client.send(MessageType.DEBUG_PATHS, msg);
      }
    }
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
    const typeDef = ENEMY_TYPES.zombie;
    const derived = computeEnemyDerivedStats(typeDef);

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
        enemy.enemyType = typeDef.id;
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

  private reassignLeader(): void {
    // Leader is the first player in the map
    let leaderAssigned = false;
    this.state.players.forEach((player: PlayerState) => {
      if (!leaderAssigned) {
        player.isLeader = true;
        leaderAssigned = true;
      } else {
        player.isLeader = false;
      }
    });
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

  private findSpawnPosition(): { x: number; z: number } | null {
    // Find the SPAWN tile as base position
    let spawnTileX = -1;
    let spawnTileY = -1;
    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        if (this.tileMap.get(x, y) === TileType.SPAWN) {
          spawnTileX = x;
          spawnTileY = y;
          break;
        }
      }
      if (spawnTileX >= 0) break;
    }
    if (spawnTileX < 0) return null;

    const minDist = 1.2; // minimum distance between players (world units)

    // BFS outward from spawn tile to find a free walkable position
    const visited = new Set<string>();
    const queue: { tx: number; tz: number }[] = [{ tx: spawnTileX, tz: spawnTileY }];
    visited.add(`${spawnTileX},${spawnTileY}`);

    while (queue.length > 0) {
      const { tx, tz } = queue.shift()!;
      const wx = tx * TILE_SIZE;
      const wz = tz * TILE_SIZE;

      // Check if any existing player is too close to this position
      let occupied = false;
      this.state.players.forEach((p) => {
        const dx = p.x - wx;
        const dz = p.z - wz;
        if (dx * dx + dz * dz < minDist * minDist) {
          occupied = true;
        }
      });

      if (!occupied) {
        return { x: wx, z: wz };
      }

      // Expand to neighboring walkable tiles
      for (const [nx, nz] of [
        [tx - 1, tz],
        [tx + 1, tz],
        [tx, tz - 1],
        [tx, tz + 1],
      ]) {
        const key = `${nx},${nz}`;
        if (!visited.has(key) && this.tileMap.isFloor(nx, nz)) {
          visited.add(key);
          queue.push({ tx: nx, tz: nz });
        }
      }
    }

    // Fallback: all nearby tiles occupied, return spawn anyway
    return { x: spawnTileX * TILE_SIZE, z: spawnTileY * TILE_SIZE };
  }
}
