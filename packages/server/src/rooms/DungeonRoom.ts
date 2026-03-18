/**
 * DungeonRoom — Main Colyseus room orchestrating all server-side game systems.
 *
 * System wiring (onCreate):
 *
 *   DungeonRoom
 *     ├─ DungeonGenerator   → procedural dungeon layout
 *     ├─ Pathfinder         → A* pathfinding on tile grid
 *     ├─ AISystem           → creature AI (threat, chase, attack, leash, roam)
 *     ├─ CombatSystem       → player auto-attack + active skills
 *     ├─ EffectSystem       → buff/debuff application + stat recomputation
 *     ├─ ChatSystem         → chat messages + slash commands
 *     ├─ GateSystem         → lobby gates with countdown
 *     ├─ GameLoop           → tick orchestrator (32 Hz default)
 *     └─ PlayerSessionManager → join/leave/reconnect/persistence
 *
 * Room lifecycle:
 *
 *   onCreate()  → generate dungeon, wire systems, register message handlers
 *   onAuth()    → JWT validation, duplicate login detection
 *   onJoin()    → load/create character from DB, spawn player, send tutorials
 *   onDrop()    → connection lost, start reconnection window (120s)
 *   onLeave()   → save character to DB, cleanup from all systems
 *   onDispose() → final cleanup
 *
 * AOI (Area of Interest) culling:
 *   Creatures beyond AOI_RANGE tiles from ALL players are removed from
 *   Colyseus sync state (but kept in allCreatures map). Re-added when
 *   a player moves within range. Checked every AOI_CHECK_TICKS.
 *
 * Message handlers:
 *   MOVE, SPRINT, SKILL_USE, SKILL_TOGGLE, ITEM_USE, ITEM_SWAP,
 *   STAT_ALLOCATE, TALENT_ALLOCATE, CHAT_SEND, GATE_INTERACT,
 *   SET_TARGET, REVIVE_START, EXIT_INTERACT, LOOT_TAKE,
 *   PROMOTE_LEADER, PARTY_KICK, TUTORIAL_DISMISS, ADMIN_RESTART,
 *   ITEM_DEFS_REQUEST, SKILL_DEFS_REQUEST, EFFECT_DEFS_REQUEST,
 *   CLASS_DEFS_REQUEST, TALENT_DEFS_REQUEST
 */
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
import { CreatureState } from "../state/CreatureState";
import { GateState } from "../state/GateState";
import { DungeonGenerator } from "../dungeon/DungeonGenerator";
import type { Room as DungeonRoomDef } from "../dungeon/DungeonGenerator";
import { Pathfinder } from "../navigation/Pathfinder";
import { AISystem } from "../systems/AISystem";
import { CombatSystem } from "../systems/CombatSystem";
import { GateSystem } from "../systems/GateSystem";
import { GameLoop } from "../systems/GameLoop";
import { EffectSystem } from "../systems/EffectSystem";
import { ChatSystem } from "../chat/ChatSystem";
import type { ChatRoomBridge } from "../chat/ChatSystem";
import { registerCommands } from "../chat/commands";
import { resetTutorials } from "../tutorials/resetTutorials";
import { PlayerSessionManager } from "./PlayerSessionManager";
import { getItemDef, getItemDefsForClient, getItemRegistryVersion } from "../items/ItemRegistry";
import { getSkillDef, getSkillDefs, getSkillRegistryVersion } from "../skills/SkillRegistry";
import { getEffectDefsForClient, getEffectRegistryVersion } from "../effects/EffectRegistry";
import { getClassDefsForClient, getClassRegistryVersion } from "../classes/ClassRegistry";
import {
  getTalentDef,
  getTalentDefsForClient,
  getTalentRegistryVersion,
} from "../talents/TalentRegistry";
import { executeEffect } from "../items/EffectHandlers";
import { getCreatureTypesForLevel, getCreatureTypeDef } from "../creatures/CreatureTypeRegistry";
import {
  ChatVariant,
  DUNGEON_WIDTH,
  DUNGEON_HEIGHT,
  DUNGEON_ROOMS,
  TILE_SIZE,
  type TileMap,
  TileType,
  MessageType,
  generateFloorVariants,
  generateWallVariants,
  assignRoomSets,
  computeCreatureDerivedStats,
  GOLD_SAVE_INTERVAL,
  CloseCode,
  Role,
  GateType,
  MIN_PROTOCOL_VERSION,
  TutorialStep,
  ALLOCATABLE_STATS,
  INTERACT_RANGE,
  MAX_LEVEL,
  LifeState,
} from "@dungeon/shared";
import type {
  MoveMessage,
  AdminRestartMessage,
  ChatSendPayload,
  PromoteLeaderMessage,
  PartyKickMessage,
  AllocatableStatValue,
  TutorialDismissMessage,
  StatAllocateMessage,
  SprintMessage,
  AdminDebugInfoMessage,
  ItemUseMessage,
  ItemSwapMessage,
  ItemDefsRequestMessage,
  EffectDefsRequestMessage,
  ClassDefsRequestMessage,
  TalentAllocateMessage,
  TalentDefsRequestMessage,
  LootTakeMessage,
  SetTargetMessage,
  ReviveStartMessage,
} from "@dungeon/shared";
import { mulberry32, generateRoomName } from "@dungeon/shared";

/** Simulation frequency in Hz (configurable via TICK_RATE env var) */
const TICK_RATE = process.env.TICK_RATE ? Number(process.env.TICK_RATE) : 32;
const TICK_INTERVAL_MS = Math.floor(1000 / TICK_RATE);

/** Fixed seed for deterministic dungeon generation (set to null for random). */
const DUNGEON_SEED: number | null = process.env.DUNGEON_SEED
  ? Number(process.env.DUNGEON_SEED)
  : process.env.NODE_ENV !== "production"
    ? 42
    : null;

export class DungeonRoom extends Room<{ state: DungeonState }> {
  private pathfinder!: Pathfinder;
  private aiSystem!: AISystem;
  private combatSystem!: CombatSystem;
  private effectSystem: EffectSystem = new EffectSystem();
  private chatSystem!: ChatSystem;
  private gateSystem!: GateSystem;
  private gameLoop!: GameLoop;
  private sessionManager!: PlayerSessionManager;
  /** Tracks which player session each player is targeting (for commands fallback). */
  private playerTargets: Map<string, string> = new Map();
  private tileMap!: TileMap;
  private log!: Logger;

  /** Exit tile world position (center of last room) */
  private exitPos: { x: number; z: number } = { x: 0, z: 0 };
  /** Whether the exit countdown is already running */
  private exitCountdownActive: boolean = false;

  // ── Area of Interest (AOI) ──────────────────────────────────────────────────
  /** All creatures (authoritative) — includes those outside sync range */
  private allCreatures: Map<string, CreatureState> = new Map();
  /** Whether AOI culling is active (false = bypass, all creatures synced) */
  private aoiEnabled: boolean = true;
  private aoiCheckCounter: number = 0;
  private static readonly AOI_RANGE = 10;
  private static readonly AOI_CHECK_TICKS = 10;

  /** Send a message to a specific client by session ID. */
  private sendToClient = (sessionId: string, type: string, message: unknown): void => {
    const c = this.clients.find((cl) => cl.sessionId === sessionId);
    if (c) c.send(type, message);
  };

  onCreate(): void {
    this.log = createRoomLogger(this.roomId);
    // We manage room disposal ourselves via onPlayerRemoved — Colyseus
    // autoDispose would close the room when the last *client* disconnects,
    // but we need to keep the room alive for the reconnection window.
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
      isDungeonStarted: () => this.isDungeonStarted(),
      killPlayer: (sessionId: string) => this.gameLoop.killPlayer(sessionId),
      revivePlayer: (sessionId: string) => this.gameLoop.revivePlayer(sessionId),
      getPlayerTarget: (sessionId: string) => this.playerTargets.get(sessionId) ?? null,
      recomputePlayerStats: (player: PlayerState) => this.effectSystem.recomputeStats(player),
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
        onPlayerRemoved: () => self.checkRoomEmpty(),
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
      get effectSystem() {
        return self.effectSystem;
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
      tickRateTarget: TICK_RATE,
      broadcastToAdmins: (type, message) => self.broadcastToAdmins(type, message),
      sendToClient: this.sendToClient,
      get clock() {
        return self.clock;
      },
      onCreatureRemoved: (creatureId: string) => {
        self.allCreatures.delete(creatureId);
      },
      getSpawnPoint: () => self.sessionManager.findSpawnPosition(),
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
    // Exit: player interacts with the exit portal → dungeon completion countdown
    this.onMessage(MessageType.EXIT_INTERACT, (client: Client) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.lifeState !== LifeState.ALIVE) return;
      if (this.exitCountdownActive) return;

      // Check proximity to exit tile
      const dx = player.x - this.exitPos.x;
      const dz = player.z - this.exitPos.z;
      if (dx * dx + dz * dz > INTERACT_RANGE * INTERACT_RANGE) return;

      // Block exit if any creature is in active combat
      if (this.aiSystem.hasActiveCombat()) {
        this.chatSystem.sendAnnouncementTo(
          client,
          "announce.exitCombatActive",
          {},
          "Cannot exit while enemies are in combat!",
          ChatVariant.ERROR,
        );
        return;
      }

      this.exitCountdownActive = true;
      const EXIT_COUNTDOWN = 10;

      this.chatSystem.broadcastAnnouncement(
        "announce.dungeonCompleted",
        { seconds: EXIT_COUNTDOWN },
        `Dungeon completed! Closing in ${EXIT_COUNTDOWN}...`,
      );

      for (let s = EXIT_COUNTDOWN - 1; s >= 1; s--) {
        this.clock.setTimeout(
          () => {
            this.chatSystem.broadcastAnnouncement(
              "announce.dungeonCompleted",
              { seconds: s },
              `Dungeon completed! Closing in ${s}...`,
            );
          },
          (EXIT_COUNTDOWN - s) * 1000,
        );
      }

      this.clock.setTimeout(() => {
        this.chatSystem.broadcastAnnouncement(
          "announce.dungeonCompletedFinal",
          {},
          "Dungeon completed! Well done!",
        );
        // Kick all players after a short delay for the final announcement to display
        this.clock.setTimeout(() => {
          for (const c of this.clients) {
            c.leave(CloseCode.DUNGEON_COMPLETED);
          }
          // Room has autoDispose=false — disconnect explicitly after completion
          this.disconnect();
        }, 2000);
      }, EXIT_COUNTDOWN * 1000);

      this.log.info(
        { player: client.sessionId },
        "Exit portal activated — dungeon completion countdown started",
      );
    });
    // Skill toggle: enable/disable a passive skill (e.g. auto-attack)
    this.onMessage(MessageType.SKILL_TOGGLE, (client: Client, data: { skillId: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      const def = getSkillDef(data.skillId);
      if (def?.passive) {
        player.autoAttackEnabled = !player.autoAttackEnabled;
      }
    });
    // Skill use: activate an active skill (e.g. heavy strike)
    this.onMessage(MessageType.SKILL_USE, (client: Client, data: { skillId: string }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (player.lifeState !== LifeState.ALIVE) {
        client.send(MessageType.ACTION_FEEDBACK, { i18nKey: "feedback.dead" });
        return;
      }
      // Build creatures map for combat system
      const creaturesMap = new Map<string, CreatureState>();
      this.state.creatures.forEach((c: CreatureState, id: string) => creaturesMap.set(id, c));
      const result = this.combatSystem.useSkill(
        client.sessionId,
        data.skillId,
        player,
        creaturesMap,
      );
      if (result) {
        client.send(MessageType.SKILL_COOLDOWN, {
          skillId: result.skillId,
          duration: result.duration,
          remaining: result.remaining,
        });
      } else {
        // Determine reason for failure
        const cd = this.combatSystem.getSkillCooldown(client.sessionId, data.skillId);
        if (cd > 0) {
          client.send(MessageType.ACTION_FEEDBACK, { i18nKey: "feedback.onCooldown" });
        } else {
          client.send(MessageType.ACTION_FEEDBACK, { i18nKey: "feedback.noTarget" });
        }
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
      resetTutorials(
        player,
        client.sessionId,
        (_sid, type, msg) => {
          client.send(type, msg);
        },
        this.isDungeonStarted(),
      );
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
      if (!player || player.lifeState !== LifeState.ALIVE) return;
      player.sprintRequested = data.active;
      // Auto-complete the sprint tutorial on first use
      if (data.active) {
        player.tutorialsCompleted.add(TutorialStep.SPRINT);
      }
    });

    // Item use: consume an item from inventory
    this.onMessage(MessageType.ITEM_USE, (client: Client, data: ItemUseMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (player.lifeState !== LifeState.ALIVE) {
        client.send(MessageType.ACTION_FEEDBACK, { i18nKey: "feedback.dead" });
        return;
      }

      const def = getItemDef(data.itemId);
      if (!def || !def.consumable) return;

      // Check cooldown
      const cd = player.itemCooldowns.get(data.itemId);
      if (cd && cd > 0) {
        client.send(MessageType.ACTION_FEEDBACK, { i18nKey: "feedback.onCooldown" });
        return;
      }

      // Check player has the item
      if (player.countItem(data.itemId) <= 0) {
        client.send(MessageType.ACTION_FEEDBACK, { i18nKey: "feedback.noItem" });
        return;
      }

      // Execute effect
      const success = executeEffect(def.effectType, player, def.effectParams);
      if (!success) {
        client.send(MessageType.ACTION_FEEDBACK, { i18nKey: "feedback.alreadyFull" });
        return;
      }

      // Consume one
      player.removeItem(data.itemId, 1);

      // Set cooldown + confirm use (always sent so client can play sound)
      if (def.cooldown > 0) {
        player.itemCooldowns.set(data.itemId, def.cooldown);
      }
      client.send(MessageType.ITEM_COOLDOWN, {
        itemId: data.itemId,
        duration: def.cooldown,
        useSound: def.useSound || undefined,
      });
    });

    // Item swap: move / swap inventory slots
    this.onMessage(MessageType.ITEM_SWAP, (client: Client, data: ItemSwapMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;
      if (typeof data.from !== "number" || typeof data.to !== "number") return;
      player.swapSlots(data.from, data.to, (itemId) => {
        const def = getItemDef(itemId);
        return def?.maxStack ?? 1;
      });
    });

    // Target selection: player selects or clears their attack target
    this.onMessage(MessageType.SET_TARGET, (client: Client, data: SetTargetMessage) => {
      if (data.targetId === null) {
        this.combatSystem.setTarget(client.sessionId, null);
        this.playerTargets.delete(client.sessionId);
        return;
      }
      if (typeof data.targetId !== "string") return;

      if (data.targetType === "player") {
        // Player target — store for command fallback, no combat effect
        this.playerTargets.set(client.sessionId, data.targetId);
        this.combatSystem.setTarget(client.sessionId, null);
      } else {
        // Creature target (default)
        const creature = this.state.creatures.get(data.targetId);
        if (!creature || creature.isDead) return;
        this.combatSystem.setTarget(client.sessionId, data.targetId);
        this.playerTargets.delete(client.sessionId);
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
          items: getItemDefsForClient(ids),
        });
      },
    );

    // Skill definitions: client requests defs lazily by id
    this.onMessage(
      MessageType.SKILL_DEFS_REQUEST,
      (client: Client, data: { skillIds?: string[] }) => {
        const ids = data.skillIds?.slice(0, 50) ?? [];
        if (ids.length === 0) return;
        client.send(MessageType.SKILL_DEFS_RESPONSE, {
          version: getSkillRegistryVersion(),
          skills: getSkillDefs(ids),
        });
      },
    );

    // Effect definitions: client requests defs lazily by id
    this.onMessage(
      MessageType.EFFECT_DEFS_REQUEST,
      (client: Client, data: EffectDefsRequestMessage) => {
        if (!Array.isArray(data.effectIds) || data.effectIds.length === 0) return;
        const ids = data.effectIds.slice(0, 50);
        client.send(MessageType.EFFECT_DEFS_RESPONSE, {
          version: getEffectRegistryVersion(),
          effects: getEffectDefsForClient(ids),
        });
      },
    );

    // Class definitions: client requests defs lazily by id
    this.onMessage(
      MessageType.CLASS_DEFS_REQUEST,
      (client: Client, data: ClassDefsRequestMessage) => {
        if (!Array.isArray(data.classIds) || data.classIds.length === 0) return;
        const ids = data.classIds.slice(0, 50);
        client.send(MessageType.CLASS_DEFS_RESPONSE, {
          version: getClassRegistryVersion(),
          classes: getClassDefsForClient(ids),
        });
      },
    );

    // Talent definitions: client requests defs lazily by id
    this.onMessage(
      MessageType.TALENT_DEFS_REQUEST,
      (client: Client, data: TalentDefsRequestMessage) => {
        if (!Array.isArray(data.talentIds) || data.talentIds.length === 0) return;
        const ids = data.talentIds.slice(0, 50);
        client.send(MessageType.TALENT_DEFS_RESPONSE, {
          version: getTalentRegistryVersion(),
          talents: getTalentDefsForClient(ids),
        });
      },
    );

    // Talent allocation: spend a talent point
    this.onMessage(MessageType.TALENT_ALLOCATE, (client: Client, data: TalentAllocateMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.lifeState !== LifeState.ALIVE) return;
      if (player.talentPoints <= 0) return;

      const talentId = data.talentId;
      if (typeof talentId !== "string") return;

      const def = getTalentDef(talentId);
      if (!def) return;

      // Class check
      if (def.classId !== player.classId) return;

      const currentRank = player.talentAllocations.get(talentId) ?? 0;
      if (currentRank >= def.maxRank) return;

      // Level requirement
      if (player.level < def.requiredLevel) return;

      // Prerequisite check
      if (def.requiredTalentId) {
        const prereqRank = player.talentAllocations.get(def.requiredTalentId) ?? 0;
        if (prereqRank < def.requiredTalentRank) return;
      }

      // Apply
      player.talentAllocations.set(talentId, currentRank + 1);
      player.talentPoints--;

      // Handle unlock_skill effect
      const newRankEffect = def.effects.find((e) => e.rank === currentRank + 1);
      if (newRankEffect?.effectType === "unlock_skill" && newRankEffect.skillId) {
        let hasSkill = false;
        player.skills.forEach((s: string) => {
          if (s === newRankEffect.skillId) hasSkill = true;
        });
        if (!hasSkill) {
          player.skills.push(newRankEffect.skillId);
        }
      }

      // Mark tutorial as completed
      player.tutorialsCompleted.add(TutorialStep.ALLOCATE_TALENTS);

      // Recompute stats (talent stat mods apply in recomputeStats)
      const oldMaxHealth = player.maxHealth;
      this.effectSystem.recomputeStats(player);
      // Grant extra HP if maxHealth increased (same as allocateStat with vitality)
      if (player.maxHealth > oldMaxHealth) {
        player.health = Math.min(
          player.health + (player.maxHealth - oldMaxHealth),
          player.maxHealth,
        );
      }

      client.send(MessageType.TALENT_ALLOCATED, {
        talentId,
        newRank: currentRank + 1,
      });
    });

    // Loot: take an item from a loot bag on the ground
    this.onMessage(MessageType.LOOT_TAKE, (client: Client, data: LootTakeMessage) => {
      const player = this.state.players.get(client.sessionId);
      if (!player || player.lifeState !== LifeState.ALIVE) return;

      const bag = this.state.lootBags.get(data.lootBagId);
      if (!bag) return;

      // Range check
      const dx = bag.x - player.x;
      const dz = bag.z - player.z;
      if (dx * dx + dz * dz > INTERACT_RANGE * INTERACT_RANGE) return;

      // Validate slot key + item ID match
      const slotKey = String(data.itemIndex);
      const lootItem = bag.items.get(slotKey);
      if (!lootItem || lootItem.quantity <= 0) return;
      if (lootItem.itemId !== data.itemId) return;

      // Try add to inventory
      const def = getItemDef(lootItem.itemId);
      if (!def) return;
      const added = player.addItem(lootItem.itemId, lootItem.quantity, def.maxStack);
      if (added <= 0) {
        client.send(MessageType.ACTION_FEEDBACK, { i18nKey: "feedback.inventoryFull" });
        return;
      }

      // Remove item from bag (stable key — no index shifting)
      bag.items.delete(slotKey);

      // Chat notification — to the player who picked up
      this.chatSystem.sendSystemI18nTo(
        client.sessionId,
        "chat.itemPickup",
        { item: def.name, amount: added },
        `+${added} ${def.id}`,
      );

      // Notify other players
      this.chatSystem.broadcastSystemI18nExcept(
        client.sessionId,
        "chat.otherItemPickup",
        { player: player.characterName, item: def.name, amount: added },
        `${player.characterName} picked up ${added} ${def.id}`,
      );

      // If bag empty → remove from world
      if (bag.items.size === 0) {
        this.state.lootBags.delete(data.lootBagId);
      }
    });

    // Debug: subscribe/unsubscribe to path visualization (admin-only)
    this.onMessage(MessageType.DEBUG_PATHS, (client: Client, data: { enabled: boolean }) => {
      const role = (client.auth as { role: string })?.role ?? Role.USER;
      if (role !== Role.ADMIN) return;
      this.gameLoop.setDebugPaths(client.sessionId, data.enabled);
    });

    // Debug: toggle AOI culling (admin-only)
    this.onMessage(MessageType.TOGGLE_AOI, (client: Client, data: { enabled: boolean }) => {
      const role = (client.auth as { role: string })?.role ?? Role.USER;
      if (role !== Role.ADMIN) return;
      this.aoiEnabled = data.enabled;
      this.log.info({ aoiEnabled: data.enabled }, "AOI toggled");
      if (!data.enabled) {
        // Bypass: sync all creatures immediately
        for (const [id, creature] of this.allCreatures) {
          if (!this.state.creatures.has(id)) {
            this.state.creatures.set(id, creature);
          }
        }
      }
    });

    // Revive: start channelling on a downed teammate
    this.onMessage(MessageType.REVIVE_START, (client: Client, data: ReviveStartMessage) => {
      if (!data.targetSessionId || typeof data.targetSessionId !== "string") return;
      this.gameLoop.startRevive(client.sessionId, data.targetSessionId);
    });

    // Auto-save gold for all players periodically
    this.clock.setInterval(() => {
      this.sessionManager.saveAllPlayersProgress();
    }, GOLD_SAVE_INTERVAL);

    // Game loop (includes AOI check)
    const gameLoopUpdate = this.gameLoop.update.bind(this.gameLoop);
    this.setSimulationInterval((dt: number) => {
      gameLoopUpdate(dt);
      this.updateCreatureAOI();
    }, TICK_INTERVAL_MS);
  }

  /**
   * Periodically add/remove creatures from the synced state based on
   * proximity to any connected player. Runs every AOI_CHECK_TICKS ticks.
   */
  private updateCreatureAOI(): void {
    if (!this.aoiEnabled) return;
    if (++this.aoiCheckCounter < DungeonRoom.AOI_CHECK_TICKS) return;
    this.aoiCheckCounter = 0;

    // Before the dungeon starts (lobby), don't sync any creatures
    if (!this.isDungeonStarted()) {
      if (this.state.creatures.size > 0) {
        this.state.creatures.clear();
      }
      return;
    }

    const rangeSq = DungeonRoom.AOI_RANGE * DungeonRoom.AOI_RANGE;

    for (const [id, creature] of this.allCreatures) {
      // Dead creatures are cleaned up by GameLoop — skip
      if (creature.isDead) continue;

      let inRange = false;
      for (const [, player] of this.state.players) {
        if (player.lifeState !== LifeState.ALIVE) continue;
        const dx = creature.x - player.x;
        const dz = creature.z - player.z;
        if (dx * dx + dz * dz <= rangeSq) {
          inRange = true;
          break;
        }
      }

      const inState = this.state.creatures.has(id);
      if (inRange && !inState) {
        this.state.creatures.set(id, creature);
      } else if (!inRange && inState) {
        this.state.creatures.delete(id);
      }
    }
  }

  private generateDungeon(seed: number): void {
    this.state.dungeonSeed = seed;
    this.state.roomName = generateRoomName(seed);
    this.state.dungeonVersion++;

    const dungeonLevel = this.computeAveragePartyLevel();
    this.state.dungeonLevel = dungeonLevel;
    const generator = new DungeonGenerator();
    this.tileMap = generator.generate(DUNGEON_WIDTH, DUNGEON_HEIGHT, DUNGEON_ROOMS, seed);

    // Find EXIT tile position (center of last room)
    this.exitCountdownActive = false;
    for (let y = 0; y < this.tileMap.height; y++) {
      for (let x = 0; x < this.tileMap.width; x++) {
        if (this.tileMap.get(x, y) === TileType.EXIT) {
          this.exitPos = { x: x * TILE_SIZE, z: y * TILE_SIZE };
        }
      }
    }

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
    this.spawnCreatures(rooms, spawnRng, dungeonLevel);

    this.log.info(
      { seed, rooms: rooms.length, creatures: this.state.creatures.size },
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

    // Clear all creatures and loot bags
    this.allCreatures.clear();
    this.state.creatures.clear();
    this.state.lootBags.clear();

    // Regenerate dungeon
    this.generateDungeon(seed);

    // Reset all connected players to spawn with full health
    const spawnPos = this.sessionManager.findSpawnPosition();
    this.state.players.forEach((player: PlayerState) => {
      player.health = player.maxHealth;
      player.lifeState = LifeState.ALIVE;
      player.bleedTimer = 0;
      player.respawnTimer = 0;
      player.reviveProgress = 0;
      player.reviverSessionId = "";
      player.deathCount = 0;
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
    talentPoints: number;
    classId: string;
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
        talentPoints: characters.talentPoints,
        classId: characters.classId,
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
      talentPoints: character.talentPoints,
      classId: character.classId,
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
        tickRateTarget: TICK_RATE,
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

  /**
   * If no players remain in the room (neither online nor offline waiting to
   * reconnect), dispose the room so it is freed from the server.
   */
  private checkRoomEmpty(): void {
    if (this.state.players.size > 0) return;
    this.log.info("All players removed — disposing room");
    this.disconnect();
  }

  private handleMove(client: Client, data: MoveMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player || player.lifeState !== LifeState.ALIVE) return;

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

  private spawnCreatures(rooms: DungeonRoomDef[], rng: () => number, dungeonLevel: number): void {
    const availableTypes = getCreatureTypesForLevel(dungeonLevel);
    if (availableTypes.length === 0) return;

    let creatureId = 0;
    // Skip first room (player spawn)
    for (let i = 1; i < rooms.length; i++) {
      const room = rooms[i];
      // More creatures per room at higher dungeon levels
      const minCreatures = 1 + Math.floor(dungeonLevel / 10);
      const creatureCount = minCreatures + Math.floor(rng() * 2);

      for (let j = 0; j < creatureCount; j++) {
        const typeDef = availableTypes[Math.floor(rng() * availableTypes.length)];
        const baseDerived = computeCreatureDerivedStats(typeDef);

        const tileX = room.x + 1 + Math.floor(rng() * (room.w - 2));
        const tileY = room.y + 1 + Math.floor(rng() * (room.h - 2));

        // Assign creature level in range [dungeonLevel - 1, dungeonLevel + 2] (clamped to [1, MAX_LEVEL])
        const levelOffset = Math.floor(rng() * 4) - 1; // -1 to +2
        const creatureLevel = Math.min(MAX_LEVEL, Math.max(1, dungeonLevel + levelOffset));

        const creature = new CreatureState();
        creature.x = tileX * TILE_SIZE;
        creature.z = tileY * TILE_SIZE;
        creature.creatureType = typeDef.id;
        creature.nameKey = typeDef.name;
        creature.detectionRange = typeDef.detectionRange;
        creature.applyStats(baseDerived, creatureLevel);

        const id = `creature_${creatureId++}`;
        this.allCreatures.set(id, creature);
        this.state.creatures.set(id, creature);
        this.aiSystem.register(creature, id, typeDef.leashRange);
      }
    }
  }

  /** Compute dungeon level from the average party level (min 1). */
  private computeAveragePartyLevel(): number {
    let levelSum = 0;
    let playerCount = 0;
    this.state.players.forEach((p: PlayerState) => {
      levelSum += p.level;
      playerCount++;
    });
    return playerCount > 0 ? Math.max(1, Math.round(levelSum / playerCount)) : 1;
  }

  /** Recalculate dungeon level from current party and re-scale all creatures */
  private recalcDungeonLevel(): void {
    const newLevel = this.computeAveragePartyLevel();
    if (newLevel === this.state.dungeonLevel) return;

    const oldLevel = this.state.dungeonLevel;
    this.state.dungeonLevel = newLevel;

    // Re-scale all existing creatures to match the new dungeon level
    this.state.creatures.forEach((creature: CreatureState) => {
      const typeDef = getCreatureTypeDef(creature.creatureType);
      if (!typeDef) return;
      const baseDerived = computeCreatureDerivedStats(typeDef);
      const levelOffset = creature.level - oldLevel;
      const creatureLevel = Math.min(MAX_LEVEL, Math.max(1, newLevel + levelOffset));
      creature.applyStats(baseDerived, creatureLevel);
    });

    this.log.info(
      { dungeonLevel: newLevel, playerCount: this.state.players.size },
      "Recalculated dungeon level",
    );
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
