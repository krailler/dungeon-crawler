import type { Client, Deferred } from "colyseus";
import type { Logger } from "pino";
import { eq } from "drizzle-orm";
import { pid } from "../logger";
import { getDb } from "../db/database";
import { characters } from "../db/schema";
import { DungeonState } from "../state/DungeonState";
import { PlayerState } from "../state/PlayerState";
import { TileType, TILE_SIZE, xpToNextLevel } from "@dungeon/shared";
import type { TileMap } from "@dungeon/shared";
import {
  registerSession,
  unregisterSession,
  isActiveSession,
} from "../sessions/activeSessionRegistry";

const RECONNECT_TIMEOUT = 60 * 5; // seconds
const RECONNECT_WARNINGS = [30, 10];

export interface SessionRoomBridge {
  readonly state: DungeonState;
  readonly clients: Iterable<Client>;
  tileMap: TileMap;
  combatSystem: { registerPlayer(sid: string): void; removePlayer(sid: string): void };
  aiSystem: { removePlayer(sid: string): void };
  chatSystem: {
    removePlayer(sid: string): void;
    broadcastSystemI18n(key: string, params: Record<string, unknown>, fallback: string): void;
  };
  allowReconnection(client: Client, seconds: number): Deferred<Client>;
  onSessionCleanup(sessionId: string): void;
}

export class PlayerSessionManager {
  private bridge: SessionRoomBridge;
  private log: Logger;
  private kickedSessions: Set<string> = new Set();
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>[]> = new Map();
  private accountToSession: Map<string, string> = new Map();
  private lastSavedHash: Map<string, string> = new Map();

  constructor(bridge: SessionRoomBridge, log: Logger) {
    this.bridge = bridge;
    this.log = log;
  }

  handleJoin(client: Client): void {
    const {
      accountId,
      characterId,
      characterName,
      role,
      strength,
      vitality,
      agility,
      level,
      gold,
      xp,
    } = client.auth as {
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
    };

    // Kick previous session if same account is already connected (any room)
    registerSession(accountId, client);

    this.log.info(
      { player: pid(client.sessionId), accountId, characterName, role },
      "Player joined",
    );

    // Check if this account already has a disconnected player in this room
    const oldSessionId = this.accountToSession.get(accountId);
    const existingPlayer = oldSessionId ? this.bridge.state.players.get(oldSessionId) : undefined;

    if (existingPlayer && oldSessionId && oldSessionId !== client.sessionId) {
      // Migrate existing player state to the new session
      this.log.info(
        { player: pid(client.sessionId), oldSession: pid(oldSessionId) },
        "Migrating player state from old session",
      );

      // Clean up old session references
      this.clearReconnectTimers(oldSessionId);
      this.removePlayerFromAllSystems(oldSessionId);

      // Revive the player under the new session
      existingPlayer.online = true;
      existingPlayer.isMoving = false;
      existingPlayer.path = [];
      existingPlayer.currentPathIndex = 0;
      existingPlayer.role = role;

      this.bridge.state.players.set(client.sessionId, existingPlayer);
      this.bridge.combatSystem.registerPlayer(client.sessionId);
      this.accountToSession.set(accountId, client.sessionId);
      this.reassignLeader();

      // Chat: broadcast reconnect event
      this.bridge.chatSystem.broadcastSystemI18n(
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
    player.gold = gold;
    player.xp = xp;
    player.xpToNext = xpToNextLevel(level);
    player.characterId = characterId;
    this.lastSavedHash.set(
      characterId,
      `${gold}:${xp}:${level}:${strength}:${vitality}:${agility}`,
    );

    // Compute derived stats
    player.applyDerivedStats();
    player.health = player.maxHealth;

    // Find spawn position
    const spawnPos = this.findSpawnPosition();
    if (spawnPos) {
      player.x = spawnPos.x;
      player.z = spawnPos.z;
    }
    player.rotY = Math.PI;

    this.bridge.state.players.set(client.sessionId, player);
    this.bridge.combatSystem.registerPlayer(client.sessionId);
    this.accountToSession.set(accountId, client.sessionId);
    this.reassignLeader();

    // Chat: broadcast join event
    this.bridge.chatSystem.broadcastSystemI18n(
      "chat.joined",
      { name: characterName },
      `${characterName} joined the dungeon.`,
    );
  }

  async handleDrop(client: Client): Promise<void> {
    const auth = client.auth as { accountId?: string } | undefined;

    // If this client was kicked via /kick or party kick, state already cleaned up — just unregister
    // Don't delete from kickedSessions here; onLeave will consume it to skip the "left" broadcast
    if (this.kickedSessions.has(client.sessionId)) {
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
      this.removePlayerFromAllSystems(client.sessionId);
      this.reassignLeader();
      return;
    }

    this.log.warn(
      { player: pid(client.sessionId) },
      `Player dropped — waiting ${RECONNECT_TIMEOUT}s for reconnect`,
    );

    // Stop the player while disconnected
    const player = this.bridge.state.players.get(client.sessionId);
    if (player) {
      player.isMoving = false;
      player.online = false;
      player.path = [];
      player.currentPathIndex = 0;
      this.bridge.chatSystem.broadcastSystemI18n(
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
          this.bridge.chatSystem.broadcastSystemI18n(
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
      await this.bridge.allowReconnection(client, RECONNECT_TIMEOUT);
    } catch {
      // Reconnection timed out — remove player
      this.log.info({ player: pid(client.sessionId) }, "Reconnection timed out — player removed");
      this.clearReconnectTimers(client.sessionId);
      // Save progress before removing
      const droppedPlayer = this.bridge.state.players.get(client.sessionId);
      if (droppedPlayer) {
        this.savePlayerProgress(droppedPlayer);
      }
      this.bridge.chatSystem.broadcastSystemI18n(
        "chat.reconnectExpired",
        { name: playerName },
        `${playerName} failed to reconnect and has been removed.`,
      );
      this.bridge.state.players.delete(client.sessionId);
      this.bridge.combatSystem.removePlayer(client.sessionId);
      this.bridge.aiSystem.removePlayer(client.sessionId);
      this.removeAccountMapping(client);
      this.unregisterClient(client);
      this.reassignLeader();
    }
  }

  handleReconnect(client: Client): void {
    this.log.info({ player: pid(client.sessionId) }, "Player reconnected");
    this.clearReconnectTimers(client.sessionId);
    const player = this.bridge.state.players.get(client.sessionId);
    if (player) {
      player.online = true;
      this.bridge.chatSystem.broadcastSystemI18n(
        "chat.reconnected",
        { name: player.characterName },
        `${player.characterName} reconnected.`,
      );
    }
  }

  /**
   * Handle a consented leave (tab close / page reload) during an active dungeon.
   *
   * Unlike `handleDrop` this does NOT call `allowReconnection` — that API is
   * only valid inside `onDrop`. Instead we just mark the player as offline and
   * set a timeout.  If the same account logs in again, `handleJoin` will
   * migrate the player state via `accountToSession`.
   */
  handleConsentedLeaveDuringDungeon(client: Client): void {
    const auth = client.auth as { accountId?: string } | undefined;

    // If this client was replaced by a newer session, clean up immediately
    if (auth?.accountId && !isActiveSession(auth.accountId, client)) {
      this.log.info(
        { player: pid(client.sessionId) },
        "Replaced session left — removing immediately",
      );
      this.clearReconnectTimers(client.sessionId);
      this.removePlayerFromAllSystems(client.sessionId);
      this.reassignLeader();
      return;
    }

    const player = this.bridge.state.players.get(client.sessionId);
    if (player) {
      player.isMoving = false;
      player.online = false;
      player.path = [];
      player.currentPathIndex = 0;

      const name = player.characterName || client.sessionId.slice(0, 6);
      this.log.warn(
        { player: pid(client.sessionId) },
        `Player left during dungeon — waiting ${RECONNECT_TIMEOUT}s for rejoin`,
      );
      this.bridge.chatSystem.broadcastSystemI18n(
        "chat.disconnectedWithTime",
        { name, seconds: RECONNECT_TIMEOUT },
        `${name} disconnected. ${RECONNECT_TIMEOUT}s to reconnect.`,
      );

      // Schedule timeout to remove the player if they don't come back
      const timer = setTimeout(() => {
        // Only remove if this session is still the active one for this account
        if (!this.bridge.state.players.has(client.sessionId)) return;
        this.log.info({ player: pid(client.sessionId) }, "Rejoin timed out — player removed");
        this.savePlayerProgress(player);
        this.removePlayerFromAllSystems(client.sessionId);
        this.removeAccountMapping(client);
        this.unregisterClient(client);
        this.reassignLeader();
        this.bridge.chatSystem.broadcastSystemI18n(
          "chat.reconnectExpired",
          { name },
          `${name} failed to reconnect and has been removed.`,
        );
      }, RECONNECT_TIMEOUT * 1000);
      this.reconnectTimers.set(client.sessionId, [timer]);
    }
  }

  handleLeave(client: Client): void {
    // If already cleaned up by kick, skip everything
    if (this.kickedSessions.has(client.sessionId)) {
      this.kickedSessions.delete(client.sessionId);
      // Still save progress for kicked players
      const kickedPlayer = this.bridge.state.players.get(client.sessionId);
      if (kickedPlayer) {
        this.savePlayerProgress(kickedPlayer);
      }
      this.removeAccountMapping(client);
      this.unregisterClient(client);
      return;
    }
    const player = this.bridge.state.players.get(client.sessionId);
    const name = player?.characterName || client.sessionId.slice(0, 6);
    // Save progress to DB before removing player
    if (player) {
      this.savePlayerProgress(player);
    }
    this.log.info({ player: pid(client.sessionId) }, "Player left");
    this.bridge.state.players.delete(client.sessionId);
    this.bridge.combatSystem.removePlayer(client.sessionId);
    this.bridge.aiSystem.removePlayer(client.sessionId);
    this.bridge.chatSystem.removePlayer(client.sessionId);
    this.removeAccountMapping(client);
    this.unregisterClient(client);
    this.reassignLeader();
    this.bridge.chatSystem.broadcastSystemI18n("chat.left", { name }, `${name} left the dungeon.`);
  }

  markKicked(sessionId: string): void {
    this.kickedSessions.add(sessionId);
  }

  removePlayerFromAllSystems(sessionId: string): void {
    this.bridge.state.players.delete(sessionId);
    this.bridge.combatSystem.removePlayer(sessionId);
    this.bridge.aiSystem.removePlayer(sessionId);
    this.bridge.chatSystem.removePlayer(sessionId);
  }

  findSpawnPosition(): { x: number; z: number } | null {
    // Find the SPAWN tile as base position
    let spawnTileX = -1;
    let spawnTileY = -1;
    for (let y = 0; y < this.bridge.tileMap.height; y++) {
      for (let x = 0; x < this.bridge.tileMap.width; x++) {
        if (this.bridge.tileMap.get(x, y) === TileType.SPAWN) {
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
      this.bridge.state.players.forEach((p) => {
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
        if (!visited.has(key) && this.bridge.tileMap.isFloor(nx, nz)) {
          visited.add(key);
          queue.push({ tx: nx, tz: nz });
        }
      }
    }

    // Fallback: all nearby tiles occupied, return spawn anyway
    return { x: spawnTileX * TILE_SIZE, z: spawnTileY * TILE_SIZE };
  }

  reassignLeader(): void {
    // Leader is the first player in the map
    let leaderAssigned = false;
    this.bridge.state.players.forEach((player: PlayerState) => {
      if (!leaderAssigned) {
        player.isLeader = true;
        leaderAssigned = true;
      } else {
        player.isLeader = false;
      }
    });
  }

  savePlayerProgress(player: PlayerState): void {
    const { characterId, gold, xp, level, strength, vitality, agility } = player;
    if (!characterId) return;
    const hash = `${gold}:${xp}:${level}:${strength}:${vitality}:${agility}`;
    if (this.lastSavedHash.get(characterId) === hash) return;
    const db = getDb();
    db.update(characters)
      .set({ gold, xp, level, strength, vitality, agility })
      .where(eq(characters.id, characterId))
      .then(() => {
        this.lastSavedHash.set(characterId, hash);
        this.log.debug({ characterId, gold, xp, level }, "Progress saved");
      })
      .catch((err) => {
        this.log.error({ characterId, err }, "Failed to save progress");
      });
  }

  saveAllPlayersProgress(): void {
    this.bridge.state.players.forEach((player: PlayerState) => {
      this.savePlayerProgress(player);
    });
  }

  getSessionForAccount(accountId: string): string | undefined {
    return this.accountToSession.get(accountId);
  }

  private clearReconnectTimers(sessionId: string): void {
    const timers = this.reconnectTimers.get(sessionId);
    if (timers) {
      for (const t of timers) clearTimeout(t);
      this.reconnectTimers.delete(sessionId);
    }
  }

  private removeAccountMapping(client: Client): void {
    const auth = client.auth as { accountId?: string } | undefined;
    if (auth?.accountId && this.accountToSession.get(auth.accountId) === client.sessionId) {
      this.accountToSession.delete(auth.accountId);
    }
    this.bridge.onSessionCleanup(client.sessionId);
  }

  private unregisterClient(client: Client): void {
    const auth = client.auth as { accountId?: string } | undefined;
    if (auth?.accountId) {
      unregisterSession(auth.accountId, client);
    }
  }
}
