import type { Client, Deferred } from "colyseus";
import type { Logger } from "pino";
import { eq, and, notInArray, sql } from "drizzle-orm";
import { pid } from "../logger";
import { getDb } from "../db/database";
import type { DbTransaction } from "../db/database";
import {
  characters,
  characterInventory,
  characterConsumableBar,
  characterSkills,
  characterTalents,
} from "../db/schema";
import { getItemDef } from "../items/ItemRegistry";
import { DungeonState } from "../state/DungeonState";
import { PlayerState } from "../state/PlayerState";
import { InventorySlotState } from "../state/InventorySlotState";
import {
  TileType,
  TILE_SIZE,
  xpToNextLevel,
  MessageType,
  TutorialStep,
  GateType,
  MAX_CONSUMABLE_BAR_SLOTS,
} from "@dungeon/shared";
import type { TileMap, RoleValue } from "@dungeon/shared";
import { getClassDef } from "../classes/ClassRegistry";
import { getTalentsForClass, getTalentDef } from "../talents/TalentRegistry";
import { getSkillDef } from "../skills/SkillRegistry";
import {
  registerSession,
  unregisterSession,
  isActiveSession,
} from "../sessions/activeSessionRegistry";

const RECONNECT_TIMEOUT = 60 * 5; // seconds
const RECONNECT_WARNINGS = [30, 10, 5, 4, 3, 2, 1]; // seconds before timeout to send warnings

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
  clock: { setTimeout(fn: () => void, ms: number): unknown };
  sendToClient(sessionId: string, type: string, message: unknown): void;
  allowReconnection(client: Client, seconds: number): Deferred<Client>;
  onSessionCleanup(sessionId: string): void;
  /** Called after a player is permanently removed from state. */
  onPlayerRemoved(): void;
  /** Recompute derived stats including talent + effect modifiers. */
  recomputeStats(player: PlayerState): void;
}

export class PlayerSessionManager {
  private bridge: SessionRoomBridge;
  private log: Logger;
  private kickedSessions: Set<string> = new Set();
  private reconnectTimers: Map<string, ReturnType<typeof setTimeout>[]> = new Map();
  private accountToSession: Map<string, string> = new Map();
  private lastSavedHash: Map<string, string> = new Map();
  /** Sessions currently being processed by handleDrop/handleConsentedLeaveDuringDungeon — prevents double processing when both onDrop and onLeave fire for the same client. */
  private processingDisconnect: Set<string> = new Set();

  constructor(bridge: SessionRoomBridge, log: Logger) {
    this.bridge = bridge;
    this.log = log;
  }

  /** Readable player identifier for logs: "CharName (ABC123)" or just "ABC123". */
  private who(client: Client): string {
    const player = this.bridge.state.players.get(client.sessionId);
    const short = pid(client.sessionId);
    return player ? `${player.characterName} (${short})` : short;
  }

  async handleJoin(client: Client): Promise<void> {
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
      statPoints,
      talentPoints,
      classId,
      tutorialsCompleted: tutorialsRaw,
    } = client.auth as {
      accountId: string;
      characterId: string;
      characterName: string;
      role: RoleValue;
      strength: number;
      vitality: number;
      agility: number;
      level: number;
      gold: number;
      xp: number;
      statPoints: number;
      talentPoints: number;
      classId: string;
      tutorialsCompleted: string;
    };

    // Kick previous session if same account is already connected (any room)
    registerSession(accountId, client);

    // Check if this account already has a disconnected player in this room
    const oldSessionId = this.accountToSession.get(accountId);
    const existingPlayer = oldSessionId ? this.bridge.state.players.get(oldSessionId) : undefined;

    this.log.info({ player: characterName, accountId, role }, "Player joined");

    if (existingPlayer && oldSessionId && oldSessionId !== client.sessionId) {
      // Migrate existing player state to the new session
      this.log.info(
        { player: characterName, oldSession: pid(oldSessionId) },
        "Migrating player state from old session",
      );

      // Clean up old session references (don't notify — player is being migrated, not removed)
      this.clearReconnectTimers(oldSessionId);
      this.removePlayerFromAllSystems(oldSessionId, false);

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
    player.statPoints = statPoints;
    player.talentPoints = talentPoints;
    player.characterId = characterId;
    player.classId = classId;

    // Load class scaling from registry (fallback to default if class not found)
    const classDef = getClassDef(classId);
    if (classDef) {
      player.statScaling = classDef.scaling;
    }

    // Parse tutorial completion from DB
    try {
      const parsed = JSON.parse(tutorialsRaw || "[]") as string[];
      player.tutorialsCompleted = new Set(parsed);
    } catch {
      player.tutorialsCompleted = new Set();
    }

    // Compute an initial hash so early disconnects don't skip saves
    this.lastSavedHash.set(characterId, this.buildProgressHash(player));

    // Load inventory + consumable bar + skills + talents from DB before computing stats
    await Promise.all([
      this.loadInventory(characterId, player),
      this.loadConsumableBar(characterId, player),
      this.loadCharacterSkills(characterId, player),
      this.loadCharacterTalents(characterId, player),
    ]);
    this.lastSavedHash.set(characterId, this.buildProgressHash(player));

    // Send talent state to owning client (talentPoints synced via Schema)
    const classTalentIds = getTalentsForClass(player.classId).map((t) => t.id);
    this.bridge.sendToClient(client.sessionId, MessageType.TALENT_STATE, {
      allocations: Array.from(player.talentAllocations.entries()).map(([talentId, rank]) => ({
        talentId,
        rank,
      })),
      classTalentIds,
    });

    // Compute derived stats with talent modifiers + full heal
    this.bridge.recomputeStats(player);
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

    // Tutorial: send START_DUNGEON hint to new leader after a short delay
    this.sendTutorialHintIfNeeded(client.sessionId);

    // Chat: broadcast join event
    this.bridge.chatSystem.broadcastSystemI18n(
      "chat.joined",
      { name: characterName },
      `${characterName} joined the dungeon.`,
    );
  }

  async handleDrop(client: Client): Promise<void> {
    // If this client was kicked via /kick or party kick, state already cleaned up — just unregister
    // Don't delete from kickedSessions here; onLeave will consume it to skip the "left" broadcast
    if (this.kickedSessions.has(client.sessionId)) {
      this.log.info({ player: this.who(client) }, "Kicked player dropped — skipping reconnect");
      this.unregisterClient(client);
      return;
    }

    if (this.handleReplacedSession(client)) return;

    // Guard: prevent double processing if onLeave also fires for this client
    if (this.processingDisconnect.has(client.sessionId)) return;
    this.processingDisconnect.add(client.sessionId);

    this.log.warn(
      { player: this.who(client) },
      `Player dropped — waiting ${RECONNECT_TIMEOUT}s for reconnect`,
    );

    const playerName = this.suspendPlayer(client);
    this.scheduleReconnectTimers(client, playerName, false);

    // Allow reconnection (only valid inside onDrop — handles expiry itself)
    try {
      await this.bridge.allowReconnection(client, RECONNECT_TIMEOUT);
    } catch {
      // If the session was replaced (player migrated to a new session), skip expiry
      const auth = client.auth as { accountId?: string } | undefined;
      const replaced = auth?.accountId && !isActiveSession(auth.accountId, client);
      if (replaced) {
        this.clearReconnectTimers(client.sessionId);
      } else {
        this.expirePlayer(client, playerName);
      }
    } finally {
      this.processingDisconnect.delete(client.sessionId);
    }
  }

  /**
   * Handle a consented leave (tab close / page reload) during an active dungeon.
   *
   * Unlike `handleDrop` this does NOT call `allowReconnection` — that API is
   * only valid inside `onDrop`. Instead we mark the player as offline and set a
   * simple timeout. If the same account logs in again, `handleJoin` will
   * migrate the player state via `accountToSession`.
   */
  handleConsentedLeaveDuringDungeon(client: Client): void {
    if (this.handleReplacedSession(client)) return;

    // Player already removed (e.g. by a prior expiry) — nothing to do
    if (!this.bridge.state.players.has(client.sessionId)) return;

    // Guard: prevent double processing if onDrop already handled this client
    if (this.processingDisconnect.has(client.sessionId)) return;
    this.processingDisconnect.add(client.sessionId);

    this.log.warn(
      { player: this.who(client) },
      `Player left during dungeon — waiting ${RECONNECT_TIMEOUT}s for rejoin`,
    );

    const playerName = this.suspendPlayer(client);
    this.scheduleReconnectTimers(client, playerName, true);
  }

  handleReconnect(client: Client): void {
    this.log.info({ player: this.who(client) }, "Player reconnected");
    this.processingDisconnect.delete(client.sessionId);
    this.clearReconnectTimers(client.sessionId);

    // Re-register session — Colyseus may provide a new Client reference after
    // reconnection, so the activeSessionRegistry must be updated to avoid
    // isActiveSession() returning false for the reconnected client.
    const auth = client.auth as { accountId?: string } | undefined;
    if (auth?.accountId) {
      registerSession(auth.accountId, client);
    }

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

  // ── Shared helpers for handleDrop / handleConsentedLeaveDuringDungeon ────

  /**
   * Schedule warning timers for a disconnected player.
   * @param withExpiry If true, also schedule a timeout to remove the player.
   *                   Pass false when `allowReconnection` handles the expiry.
   */
  private scheduleReconnectTimers(client: Client, playerName: string, withExpiry: boolean): void {
    const timers: ReturnType<typeof setTimeout>[] = [];
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
    if (withExpiry) {
      timers.push(
        setTimeout(() => {
          if (!this.bridge.state.players.has(client.sessionId)) return;
          this.expirePlayer(client, playerName);
          this.processingDisconnect.delete(client.sessionId);
        }, RECONNECT_TIMEOUT * 1000),
      );
    }
    this.reconnectTimers.set(client.sessionId, timers);
  }

  /** If the session was replaced by a newer login, clean up and return true. */
  private handleReplacedSession(client: Client): boolean {
    const auth = client.auth as { accountId?: string } | undefined;
    if (auth?.accountId && !isActiveSession(auth.accountId, client)) {
      this.log.info({ player: this.who(client) }, "Replaced session — removing immediately");
      this.clearReconnectTimers(client.sessionId);
      this.removePlayerFromAllSystems(client.sessionId);
      this.processingDisconnect.delete(client.sessionId);
      this.reassignLeader();
      return true;
    }
    return false;
  }

  /** Mark the player as offline and broadcast the disconnect message. Returns the player name. */
  private suspendPlayer(client: Client): string {
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
    return player?.characterName || client.sessionId.slice(0, 6);
  }

  /** Remove the player after reconnect/rejoin timeout expired. */
  private async expirePlayer(client: Client, playerName: string): Promise<void> {
    this.log.info({ player: this.who(client) }, "Reconnection timed out — player removed");
    this.clearReconnectTimers(client.sessionId);
    const player = this.bridge.state.players.get(client.sessionId);
    if (player) {
      await this.savePlayerProgress(player);
    }
    this.removePlayerFromAllSystems(client.sessionId);
    this.removeAccountMapping(client);
    this.unregisterClient(client);
    this.reassignLeader();
    this.bridge.chatSystem.broadcastSystemI18n(
      "chat.reconnectExpired",
      { name: playerName },
      `${playerName} failed to reconnect and has been removed.`,
    );
  }

  async handleLeave(client: Client): Promise<void> {
    // If already cleaned up by kick, skip everything
    if (this.kickedSessions.has(client.sessionId)) {
      this.kickedSessions.delete(client.sessionId);
      this.clearReconnectTimers(client.sessionId);
      // Still save progress for kicked players
      const kickedPlayer = this.bridge.state.players.get(client.sessionId);
      if (kickedPlayer) {
        await this.savePlayerProgress(kickedPlayer);
      }
      this.removeAccountMapping(client);
      this.unregisterClient(client);
      return;
    }
    const player = this.bridge.state.players.get(client.sessionId);

    // If player was already removed (e.g. reconnect timeout expired), skip
    if (!player) {
      this.removeAccountMapping(client);
      this.unregisterClient(client);
      return;
    }

    const name = player.characterName;
    await this.savePlayerProgress(player);
    this.log.info({ player: this.who(client) }, "Player left");
    this.removePlayerFromAllSystems(client.sessionId);
    this.removeAccountMapping(client);
    this.unregisterClient(client);
    this.reassignLeader();
    this.bridge.chatSystem.broadcastSystemI18n("chat.left", { name }, `${name} left the dungeon.`);
  }

  markKicked(sessionId: string): void {
    this.kickedSessions.add(sessionId);
  }

  removePlayerFromAllSystems(sessionId: string, notify: boolean = true): void {
    this.bridge.state.players.delete(sessionId);
    this.bridge.combatSystem.removePlayer(sessionId);
    this.bridge.aiSystem.removePlayer(sessionId);
    this.bridge.chatSystem.removePlayer(sessionId);
    if (notify) this.bridge.onPlayerRemoved();
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
    let newLeaderSessionId: string | null = null;
    this.bridge.state.players.forEach((player: PlayerState, sid: string) => {
      if (!leaderAssigned) {
        player.isLeader = true;
        leaderAssigned = true;
        newLeaderSessionId = sid;
      } else {
        player.isLeader = false;
      }
    });

    // Send tutorial hint to new leader if they haven't completed it
    if (newLeaderSessionId) {
      this.sendTutorialHintIfNeeded(newLeaderSessionId);
    }
  }

  async savePlayerProgress(player: PlayerState): Promise<void> {
    if (!player.characterId) return;
    const hash = this.buildProgressHash(player);
    if (this.lastSavedHash.get(player.characterId) === hash) return;

    const db = getDb();
    try {
      await db.transaction(async (tx) => {
        await this.savePlayerTx(tx, player);
      });
      this.lastSavedHash.set(player.characterId, hash);
      this.log.debug(
        {
          characterId: player.characterId,
          gold: player.gold,
          xp: player.xp,
          level: player.level,
        },
        "Progress saved",
      );
    } catch (err) {
      this.log.error({ characterId: player.characterId, err }, "Failed to save progress");
    }
  }

  /** Write a single player's stats + inventory inside an existing transaction. */
  private async savePlayerTx(tx: DbTransaction, player: PlayerState): Promise<void> {
    const { characterId, gold, xp, level, strength, vitality, agility, statPoints, talentPoints } =
      player;
    const tutorialsCompleted = JSON.stringify([...player.tutorialsCompleted]);

    await tx
      .update(characters)
      .set({
        gold,
        xp,
        level,
        strength,
        vitality,
        agility,
        statPoints,
        talentPoints,
        tutorialsCompleted,
      })
      .where(eq(characters.id, characterId));

    await this.saveInventoryTx(tx, characterId, player);
    await this.saveConsumableBarTx(tx, characterId, player);
    await this.saveSkillsTx(tx, characterId, player);
    await this.saveTalentsTx(tx, characterId, player);
  }

  private buildProgressHash(player: PlayerState): string {
    const { gold, xp, level, strength, vitality, agility, statPoints, talentPoints } = player;
    const tut = [...player.tutorialsCompleted].sort().join(",");
    const inv = this.buildInventoryHash(player);
    const cbar = this.buildConsumableBarHash(player);
    const sk = this.buildSkillsHash(player);
    const tal = this.buildTalentsHash(player);
    return `${gold}:${xp}:${level}:${strength}:${vitality}:${agility}:${statPoints}:${talentPoints}:${tut}:${inv}:${cbar}:${sk}:${tal}`;
  }

  private buildInventoryHash(player: PlayerState): string {
    const parts: string[] = [];
    player.inventory.forEach((slot, key) => {
      parts.push(`${key}=${slot.itemId}x${slot.quantity}`);
    });
    return parts.sort().join("|");
  }

  private async loadInventory(characterId: string, player: PlayerState): Promise<void> {
    const db = getDb();
    const rows = await db
      .select()
      .from(characterInventory)
      .where(eq(characterInventory.characterId, characterId));
    let loaded = 0;
    for (const row of rows) {
      if (!getItemDef(row.itemId)) {
        this.log.warn(
          { characterId, itemId: row.itemId },
          "Inventory references unknown item — skipping",
        );
        continue;
      }
      const slot = new InventorySlotState();
      slot.itemId = row.itemId;
      slot.quantity = row.quantity;
      player.inventory.set(String(row.slotIndex), slot);
      loaded++;
    }
    if (loaded > 0) {
      this.log.debug({ characterId, slots: loaded }, "Inventory loaded");
    }
  }

  private async saveInventoryTx(
    tx: DbTransaction,
    characterId: string,
    player: PlayerState,
  ): Promise<void> {
    const activeSlots: number[] = [];
    const rows: { characterId: string; slotIndex: number; itemId: string; quantity: number }[] = [];
    player.inventory.forEach((slot, key) => {
      if (slot.quantity > 0) {
        // Skip transient items (e.g. dungeon key) — they don't persist across sessions
        const itemDef = getItemDef(slot.itemId);
        if (itemDef?.transient) return;
        const slotIndex = Number(key);
        activeSlots.push(slotIndex);
        rows.push({ characterId, slotIndex, itemId: slot.itemId, quantity: slot.quantity });
      }
    });

    // Upsert active slots + delete emptied slots
    if (rows.length > 0) {
      await tx
        .insert(characterInventory)
        .values(rows)
        .onConflictDoUpdate({
          target: [characterInventory.characterId, characterInventory.slotIndex],
          set: {
            itemId: sql`excluded.item_id`,
            quantity: sql`excluded.quantity`,
          },
        });
    }

    // Delete slots that are no longer in use
    if (activeSlots.length > 0) {
      await tx
        .delete(characterInventory)
        .where(
          and(
            eq(characterInventory.characterId, characterId),
            notInArray(characterInventory.slotIndex, activeSlots),
          ),
        );
    } else {
      // Inventory is empty — delete all
      await tx.delete(characterInventory).where(eq(characterInventory.characterId, characterId));
    }
  }

  private async loadConsumableBar(characterId: string, player: PlayerState): Promise<void> {
    // Initialize with empty slots
    for (let i = 0; i < MAX_CONSUMABLE_BAR_SLOTS; i++) {
      player.consumableBar.push("");
    }

    const db = getDb();
    const rows = await db
      .select()
      .from(characterConsumableBar)
      .where(eq(characterConsumableBar.characterId, characterId));

    let loaded = 0;
    for (const row of rows) {
      if (row.slotIndex < 0 || row.slotIndex >= MAX_CONSUMABLE_BAR_SLOTS) continue;
      const itemDef = getItemDef(row.itemId);
      if (!itemDef || !itemDef.consumable || itemDef.transient) {
        this.log.warn(
          { characterId, itemId: row.itemId },
          "Consumable bar references invalid item — skipping",
        );
        continue;
      }
      player.consumableBar[row.slotIndex] = row.itemId;
      loaded++;
    }
    if (loaded > 0) {
      this.log.debug({ characterId, slots: loaded }, "Consumable bar loaded");
    }
  }

  private async saveConsumableBarTx(
    tx: DbTransaction,
    characterId: string,
    player: PlayerState,
  ): Promise<void> {
    const activeSlots: number[] = [];
    const rows: { characterId: string; slotIndex: number; itemId: string }[] = [];
    for (let i = 0; i < player.consumableBar.length; i++) {
      const itemId = player.consumableBar[i];
      if (itemId) {
        activeSlots.push(i);
        rows.push({ characterId, slotIndex: i, itemId });
      }
    }

    if (rows.length > 0) {
      await tx
        .insert(characterConsumableBar)
        .values(rows)
        .onConflictDoUpdate({
          target: [characterConsumableBar.characterId, characterConsumableBar.slotIndex],
          set: {
            itemId: sql`excluded.item_id`,
          },
        });
    }

    if (activeSlots.length > 0) {
      await tx
        .delete(characterConsumableBar)
        .where(
          and(
            eq(characterConsumableBar.characterId, characterId),
            notInArray(characterConsumableBar.slotIndex, activeSlots),
          ),
        );
    } else {
      await tx
        .delete(characterConsumableBar)
        .where(eq(characterConsumableBar.characterId, characterId));
    }
  }

  private buildConsumableBarHash(player: PlayerState): string {
    const parts: string[] = [];
    for (let i = 0; i < player.consumableBar.length; i++) {
      if (player.consumableBar[i]) {
        parts.push(`${i}=${player.consumableBar[i]}`);
      }
    }
    return parts.join("|");
  }

  private async loadCharacterSkills(characterId: string, player: PlayerState): Promise<void> {
    const db = getDb();
    const rows = await db
      .select()
      .from(characterSkills)
      .where(eq(characterSkills.characterId, characterId));

    let skipped = 0;
    for (const row of rows) {
      if (getSkillDef(row.skillId)) {
        player.skills.push(row.skillId);
      } else {
        skipped++;
        this.log.warn({ characterId, skillId: row.skillId }, "Skipping unknown skill from DB");
      }
    }
    if (rows.length > 0) {
      this.log.debug({ characterId, skills: rows.length - skipped, skipped }, "Skills loaded");
    }
  }

  private async saveSkillsTx(
    tx: DbTransaction,
    characterId: string,
    player: PlayerState,
  ): Promise<void> {
    await tx.delete(characterSkills).where(eq(characterSkills.characterId, characterId));

    const skillIds: string[] = [];
    player.skills.forEach((skillId: string) => {
      skillIds.push(skillId);
    });

    if (skillIds.length > 0) {
      await tx
        .insert(characterSkills)
        .values(skillIds.map((skillId) => ({ characterId, skillId })));
    }
  }

  private buildSkillsHash(player: PlayerState): string {
    const parts: string[] = [];
    player.skills.forEach((skillId: string) => {
      parts.push(skillId);
    });
    return parts.sort().join(",");
  }

  private async loadCharacterTalents(characterId: string, player: PlayerState): Promise<void> {
    const db = getDb();
    const rows = await db
      .select()
      .from(characterTalents)
      .where(eq(characterTalents.characterId, characterId));

    let loaded = 0;
    for (const row of rows) {
      if (!getTalentDef(row.talentId)) {
        this.log.warn(
          { characterId, talentId: row.talentId },
          "Character references unknown talent — skipping",
        );
        continue;
      }
      player.talentAllocations.set(row.talentId, row.rank);
      loaded++;
    }
    if (loaded > 0) {
      this.log.debug({ characterId, talents: loaded }, "Talents loaded");
    }
  }

  private async saveTalentsTx(
    tx: DbTransaction,
    characterId: string,
    player: PlayerState,
  ): Promise<void> {
    await tx.delete(characterTalents).where(eq(characterTalents.characterId, characterId));

    const rows: { characterId: string; talentId: string; rank: number }[] = [];
    for (const [talentId, rank] of player.talentAllocations) {
      rows.push({ characterId, talentId, rank });
    }

    if (rows.length > 0) {
      await tx.insert(characterTalents).values(rows);
    }
  }

  private buildTalentsHash(player: PlayerState): string {
    const parts: string[] = [];
    for (const [talentId, rank] of player.talentAllocations) {
      parts.push(`${talentId}=${rank}`);
    }
    return parts.sort().join(",");
  }

  /** Send START_DUNGEON tutorial hint to the given session if they are leader and haven't completed it. */
  private sendTutorialHintIfNeeded(sessionId: string): void {
    const player = this.bridge.state.players.get(sessionId);
    if (!player?.isLeader) return;
    if (player.tutorialsCompleted.has(TutorialStep.START_DUNGEON)) return;

    // Check that lobby gates are still closed (dungeon not yet started)
    let dungeonStarted = false;
    this.bridge.state.gates.forEach((gate: { gateType: string; open: boolean }) => {
      if (gate.gateType === GateType.LOBBY && gate.open) dungeonStarted = true;
    });
    if (dungeonStarted) return;

    // Delay so the client has time to set up message listeners
    this.bridge.clock.setTimeout(() => {
      // Re-check: player might have left or is no longer leader
      const p = this.bridge.state.players.get(sessionId);
      if (!p?.isLeader || !p.online) return;
      if (p.tutorialsCompleted.has(TutorialStep.START_DUNGEON)) return;

      this.bridge.sendToClient(sessionId, MessageType.TUTORIAL_HINT, {
        step: TutorialStep.START_DUNGEON,
        i18nKey: "tutorial.startDungeon",
      });
    }, 2000);
  }

  saveAllPlayersProgress(): void {
    const dirtyPlayers: PlayerState[] = [];
    this.bridge.state.players.forEach((player: PlayerState) => {
      if (!player.characterId) return;
      const hash = this.buildProgressHash(player);
      if (this.lastSavedHash.get(player.characterId) !== hash) {
        dirtyPlayers.push(player);
      }
    });

    if (dirtyPlayers.length === 0) return;

    const db = getDb();

    db.transaction(async (tx) => {
      for (const player of dirtyPlayers) {
        await this.savePlayerTx(tx, player);
      }
    })
      .then(() => {
        for (const player of dirtyPlayers) {
          const hash = this.buildProgressHash(player);
          this.lastSavedHash.set(player.characterId, hash);
        }
        this.log.debug({ count: dirtyPlayers.length }, "Batch progress saved");
      })
      .catch((err) => {
        this.log.error({ err }, "Failed to batch save progress");
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
