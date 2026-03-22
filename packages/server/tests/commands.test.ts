import { mock, describe, it, expect, beforeEach } from "bun:test";
import { resolve } from "path";

// ── Module mocks (MUST be before imports that pull these in) ─────────────────

const SRC = resolve(import.meta.dir, "../src");
const m = (rel: string) => resolve(SRC, rel);
const mockBoth = (rel: string, factory: () => any) => {
  mock.module(m(rel), factory);
  mock.module(m(rel + ".js"), factory);
  mock.module(m(rel + ".ts"), factory);
};

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => noopLogger,
};
mockBoth("logger", () => ({
  logger: noopLogger,
  createRoomLogger: () => noopLogger,
  pid: (s: string) => s.slice(0, 6),
}));

const mockNotifyLevelProgress = mock(() => {});
mockBoth("chat/notifyLevelProgress", () => ({
  notifyLevelProgress: mockNotifyLevelProgress,
}));

const mockResetTutorials = mock(() => 3);
mockBoth("tutorials/resetTutorials", () => ({
  resetTutorials: mockResetTutorials,
}));

mockBoth("talents/TalentRegistry", () => ({
  getTalentsForClass: () => [],
}));

mockBoth("items/ItemRegistry", () => ({
  getItemDef: (id: string) =>
    id === "potion" ? { id: "potion", name: "Potion", maxStack: 5, equipSlot: null } : undefined,
}));

mockBoth("creatures/CreatureTypeRegistry", () => ({
  getCreatureTypeDef: (id: string) =>
    id === "zombie" ? { id: "zombie", name: "Zombie" } : undefined,
}));

const mockSyncAndNotifySkills = mock(() => {});
mockBoth("classes/ClassRegistry", () => ({
  syncAndNotifySkills: mockSyncAndNotifySkills,
}));

// ── Now import the code under test ──────────────────────────────────────────

import { registerCommands } from "../src/chat/commands.js";
import { CommandRegistry } from "../src/chat/CommandRegistry.js";
import type { CommandContext, CommandDefinition } from "../src/chat/CommandRegistry.js";
import type { ChatRoomBridge } from "../src/chat/ChatSystem.js";
import { PlayerState } from "../src/state/PlayerState.js";
import { LifeState, MAX_LEVEL, MessageType } from "@dungeon/shared";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<Record<string, any>> = {}): PlayerState {
  const p = new PlayerState();
  p.characterName = overrides.characterName ?? "Hero";
  p.x = overrides.x ?? 5;
  p.z = overrides.z ?? 5;
  p.level = overrides.level ?? 1;
  p.maxHealth = overrides.maxHealth ?? 100;
  p.health = overrides.health ?? 100;
  p.lifeState = overrides.lifeState ?? LifeState.ALIVE;
  p.online = overrides.online ?? true;
  p.isLeader = overrides.isLeader ?? false;
  p.classId = overrides.classId ?? "warrior";
  p.godMode = overrides.godMode ?? false;
  p.pacifist = overrides.pacifist ?? false;
  if (overrides.gold != null) p.gold = overrides.gold;
  return p;
}

function makeCtx(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    sessionId: "s1",
    player: makePlayer(),
    role: "admin",
    args: [],
    rawArgs: "",
    reply: mock(() => {}),
    replyError: mock(() => {}),
    resolveTarget: () => null,
    ...overrides,
  };
}

// Shared state across tests
let registry: CommandRegistry;
let mockBridge: ChatRoomBridge & Record<string, any>;
let mockChat: Record<string, any>;
let players: Map<string, PlayerState>;
let player1: PlayerState;
let player2: PlayerState;

function execCmd(name: string, ctx: CommandContext): void {
  const cmd = registry.get(name);
  if (!cmd) throw new Error(`Command not found: ${name}`);
  cmd.handler(ctx);
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  registry = new CommandRegistry();

  player1 = makePlayer({ characterName: "Alice" });
  player2 = makePlayer({ characterName: "Bob", isLeader: false });
  players = new Map([
    ["s1", player1],
    ["s2", player2],
  ]);

  mockBridge = {
    getAllPlayers: () => players,
    getPlayer: (sid: string) => players.get(sid),
    findPlayerByName: (name: string) => {
      for (const [sid, p] of players) {
        if (p.characterName.toLowerCase() === name.toLowerCase()) {
          return { sessionId: sid, player: p };
        }
      }
      return null;
    },
    getClients: () => [
      { sessionId: "s1", send: mock(() => {}), leave: mock(() => {}) },
      { sessionId: "s2", send: mock(() => {}), leave: mock(() => {}) },
    ],
    killPlayer: mock(() => {}),
    revivePlayer: mock(() => true),
    killCreature: mock(() => {}),
    kickPlayer: mock(() => {}),
    recomputePlayerStats: mock(() => {}),
    spawnCreature: mock(() => "creature-1"),
    sendToClient: mock(() => {}),
    isDungeonStarted: () => false,
    getPlayerTarget: () => null,
    getCreatureTarget: () => null,
  };

  mockChat = {
    getRegistry: () => registry,
    getCommandsForRole: () => [
      { name: "help", usage: "/help", description: "Show available commands", adminOnly: false },
      {
        name: "players",
        usage: "/players",
        description: "List connected players",
        adminOnly: false,
      },
    ],
    broadcastSystemI18n: mock(() => {}),
    sendSystemI18nTo: mock(() => {}),
    broadcastAnnouncement: mock(() => {}),
  };

  registerCommands(mockChat as any, mockBridge as any);

  // Reset mock call counts
  mockNotifyLevelProgress.mockClear();
  mockResetTutorials.mockClear();
  mockSyncAndNotifySkills.mockClear();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("commands", () => {
  // ── /help ───────────────────────────────────────────────────────────────

  describe("/help", () => {
    it("replies with available commands", () => {
      const ctx = makeCtx({ role: "user" });
      execCmd("help", ctx);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("Available commands");
    });
  });

  // ── /players ────────────────────────────────────────────────────────────

  describe("/players", () => {
    it("lists all connected players with HP", () => {
      const ctx = makeCtx();
      execCmd("players", ctx);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("Players (2)");
      expect(text).toContain("Alice");
      expect(text).toContain("Bob");
      expect(text).toContain("HP");
    });
  });

  // ── /kill ───────────────────────────────────────────────────────────────

  describe("/kill", () => {
    it("kills a creature when no args and creature target exists", () => {
      mockBridge.getCreatureTarget = () => "creature-42";
      const ctx = makeCtx({ args: [], rawArgs: "" });
      execCmd("kill", ctx);
      expect(mockBridge.killCreature).toHaveBeenCalledWith("creature-42");
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });

    it("kills a player by name", () => {
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("kill", ctx);
      expect(mockBridge.killPlayer).toHaveBeenCalledWith("s2");
      expect(mockChat.broadcastSystemI18n).toHaveBeenCalled();
    });

    it("errors with no target and no creature target", () => {
      mockBridge.getCreatureTarget = () => null;
      const ctx = makeCtx({ args: [], rawArgs: "" });
      execCmd("kill", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /heal ───────────────────────────────────────────────────────────────

  describe("/heal", () => {
    it("heals a player to full HP", () => {
      player1.health = 30;
      player1.maxHealth = 100;
      const ctx = makeCtx({ player: player1, args: [], rawArgs: "" });
      execCmd("heal", ctx);
      expect(player1.health).toBe(100);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });

    it("heals a named target to full HP", () => {
      player2.health = 10;
      player2.maxHealth = 100;
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("heal", ctx);
      expect(player2.health).toBe(100);
    });

    it("errors if target is not alive", () => {
      player2.lifeState = LifeState.DOWNED;
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("heal", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("not alive");
    });
  });

  // ── /revive ─────────────────────────────────────────────────────────────

  describe("/revive", () => {
    it("revives a downed player", () => {
      player2.lifeState = LifeState.DOWNED;
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("revive", ctx);
      expect(mockBridge.revivePlayer).toHaveBeenCalledWith("s2");
      expect(mockChat.broadcastSystemI18n).toHaveBeenCalled();
    });

    it("errors if target is already alive", () => {
      player2.lifeState = LifeState.ALIVE;
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("revive", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("already alive");
    });

    it("errors with no target", () => {
      const ctx = makeCtx();
      execCmd("revive", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /tp ─────────────────────────────────────────────────────────────────

  describe("/tp", () => {
    it("teleports player to target position", () => {
      player2.x = 20;
      player2.z = 30;
      const ctx = makeCtx({
        player: player1,
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("tp", ctx);
      expect(player1.x).toBe(20);
      expect(player1.z).toBe(30);
      expect(player1.isMoving).toBe(false);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });

    it("errors with no target", () => {
      const ctx = makeCtx();
      execCmd("tp", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /tpxy ───────────────────────────────────────────────────────────────

  describe("/tpxy", () => {
    it("teleports to coordinates", () => {
      const ctx = makeCtx({
        player: player1,
        args: ["12.5", "34.7"],
        rawArgs: "12.5 34.7",
      });
      execCmd("tpxy", ctx);
      expect(player1.x).toBeCloseTo(12.5);
      expect(player1.z).toBeCloseTo(34.7);
      expect(player1.isMoving).toBe(false);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });

    it("errors with fewer than 2 args", () => {
      const ctx = makeCtx({ args: ["10"], rawArgs: "10" });
      execCmd("tpxy", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });

    it("errors with non-numeric coordinates", () => {
      const ctx = makeCtx({ args: ["abc", "def"], rawArgs: "abc def" });
      execCmd("tpxy", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("Invalid");
    });
  });

  // ── /leader ─────────────────────────────────────────────────────────────

  describe("/leader", () => {
    it("transfers leadership to target", () => {
      player1.isLeader = true;
      player2.isLeader = false;
      const ctx = makeCtx({
        player: player1,
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("leader", ctx);
      // All players should have isLeader cleared, then target set
      expect(player2.isLeader).toBe(true);
      expect(mockChat.broadcastSystemI18n).toHaveBeenCalled();
    });

    it("errors if target is already leader", () => {
      player2.isLeader = true;
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("leader", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("already the leader");
    });

    it("errors with no target", () => {
      const ctx = makeCtx();
      execCmd("leader", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /setlevel ───────────────────────────────────────────────────────────

  describe("/setlevel", () => {
    it("sets level with name and number args", () => {
      const ctx = makeCtx({
        args: ["Bob", "10"],
        rawArgs: "Bob 10",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      // findPlayerByName is on the bridge (used internally)
      execCmd("setlevel", ctx);
      expect(player2.level).toBe(10);
      expect(mockBridge.recomputePlayerStats).toHaveBeenCalled();
      expect(mockSyncAndNotifySkills).toHaveBeenCalled();
      expect(mockNotifyLevelProgress).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });

    it("sets level with number-only arg using player target", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["5"],
        rawArgs: "5",
      });
      execCmd("setlevel", ctx);
      expect(player2.level).toBe(5);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });

    it("errors with invalid level range", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["0"],
        rawArgs: "0",
      });
      execCmd("setlevel", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("between 1 and");
    });

    it("errors with level above MAX_LEVEL", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: [String(MAX_LEVEL + 1)],
        rawArgs: String(MAX_LEVEL + 1),
      });
      execCmd("setlevel", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });

    it("errors with no args", () => {
      const ctx = makeCtx({ args: [], rawArgs: "" });
      execCmd("setlevel", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });

    it("errors when player name not found", () => {
      const ctx = makeCtx({
        args: ["Unknown", "5"],
        rawArgs: "Unknown 5",
      });
      execCmd("setlevel", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("not found");
    });
  });

  // ── /kick ───────────────────────────────────────────────────────────────

  describe("/kick", () => {
    it("kicks a connected player", () => {
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("kick", ctx);
      expect(mockBridge.kickPlayer).toHaveBeenCalledWith("s2");
      expect(mockChat.broadcastSystemI18n).toHaveBeenCalled();
    });

    it("errors if target is not connected (no matching client)", () => {
      // Override getClients to return empty — no client matches
      mockBridge.getClients = () => [];
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("kick", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("not connected");
    });

    it("errors with no target", () => {
      const ctx = makeCtx();
      execCmd("kick", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /resettutorials ─────────────────────────────────────────────────────

  describe("/resettutorials", () => {
    it("resets tutorials and replies with count", () => {
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("resettutorials", ctx);
      expect(mockResetTutorials).toHaveBeenCalledTimes(1);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("3");
      expect(text).toContain("Bob");
    });

    it("errors with no target", () => {
      const ctx = makeCtx();
      execCmd("resettutorials", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /resettalents ───────────────────────────────────────────────────────

  describe("/resettalents", () => {
    it("resets talents and recomputes stats", () => {
      player2.talentAllocations.set("t1", 1);
      player2.talentAllocations.set("t2", 2);
      player2.level = 10;
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("resettalents", ctx);
      expect(player2.talentAllocations.size).toBe(0);
      expect(mockBridge.recomputePlayerStats).toHaveBeenCalled();
      expect(mockBridge.sendToClient).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("2"); // 2 talents reset
    });

    it("errors with no target", () => {
      const ctx = makeCtx();
      execCmd("resettalents", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /resetstats ─────────────────────────────────────────────────────────

  describe("/resetstats", () => {
    it("resets stats and recomputes", () => {
      player2.strength = 15;
      player2.vitality = 12;
      player2.agility = 13;
      player2.level = 11;
      const ctx = makeCtx({
        args: ["Bob"],
        rawArgs: "Bob",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("resetstats", ctx);
      expect(player2.strength).toBe(10);
      expect(player2.vitality).toBe(10);
      expect(player2.agility).toBe(10);
      expect(mockBridge.recomputePlayerStats).toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });

    it("errors with no target", () => {
      const ctx = makeCtx();
      execCmd("resetstats", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /give ───────────────────────────────────────────────────────────────

  describe("/give", () => {
    it("gives an item to a named player", () => {
      const ctx = makeCtx({
        args: ["Bob", "potion", "3"],
        rawArgs: "Bob potion 3",
      });
      execCmd("give", ctx);
      expect(player2.countItem("potion")).toBe(3);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      expect(mockChat.sendSystemI18nTo).toHaveBeenCalled();
    });

    it("gives 1 item by default", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["potion"],
        rawArgs: "potion",
      });
      execCmd("give", ctx);
      expect(player2.countItem("potion")).toBe(1);
    });

    it("errors with unknown item", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["unknown_item"],
        rawArgs: "unknown_item",
      });
      execCmd("give", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("Unknown item");
    });

    it("errors with no args", () => {
      const ctx = makeCtx({ args: [], rawArgs: "" });
      execCmd("give", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });

    it("errors with invalid quantity", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["potion", "-1"],
        rawArgs: "potion -1",
      });
      execCmd("give", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("positive");
    });

    it("errors when inventory is full", () => {
      // Fill all 12 inventory slots with a different item
      for (let i = 0; i < 12; i++) {
        player2.addItem("other_item", 1, 1);
      }
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["potion"],
        rawArgs: "potion",
      });
      execCmd("give", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("inventory is full");
    });
  });

  // ── /gold ───────────────────────────────────────────────────────────────

  describe("/gold", () => {
    it("gives gold to a named player", () => {
      const initialGold = player2.gold;
      const ctx = makeCtx({
        args: ["Bob", "500"],
        rawArgs: "Bob 500",
      });
      execCmd("gold", ctx);
      expect(player2.gold).toBe(initialGold + 500);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      expect(mockChat.sendSystemI18nTo).toHaveBeenCalled();
    });

    it("gives gold via target", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const initialGold = player2.gold;
      const ctx = makeCtx({
        args: ["100"],
        rawArgs: "100",
      });
      execCmd("gold", ctx);
      expect(player2.gold).toBe(initialGold + 100);
    });

    it("errors with no args", () => {
      const ctx = makeCtx({ args: [], rawArgs: "" });
      execCmd("gold", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });

    it("errors with non-positive amount", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["0"],
        rawArgs: "0",
      });
      execCmd("gold", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("positive");
    });

    it("errors with no target", () => {
      const ctx = makeCtx({
        args: ["100"],
        rawArgs: "100",
      });
      execCmd("gold", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });
  });

  // ── /spawn ──────────────────────────────────────────────────────────────

  describe("/spawn", () => {
    it("spawns a creature near the player", () => {
      const ctx = makeCtx({
        player: player1,
        args: ["zombie"],
        rawArgs: "zombie",
      });
      execCmd("spawn", ctx);
      expect(mockBridge.spawnCreature).toHaveBeenCalledTimes(1);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("zombie");
    });

    it("spawns multiple creatures with level and count", () => {
      const ctx = makeCtx({
        player: player1,
        args: ["zombie", "10", "3"],
        rawArgs: "zombie 10 3",
      });
      execCmd("spawn", ctx);
      expect(mockBridge.spawnCreature).toHaveBeenCalledTimes(3);
      // Verify level passed
      const firstCall = (mockBridge.spawnCreature as any).mock.calls[0];
      expect(firstCall[0]).toBe("zombie");
      expect(firstCall[3]).toBe(10);
    });

    it("clamps count to 20 max", () => {
      const ctx = makeCtx({
        player: player1,
        args: ["zombie", "1", "50"],
        rawArgs: "zombie 1 50",
      });
      execCmd("spawn", ctx);
      expect(mockBridge.spawnCreature).toHaveBeenCalledTimes(20);
    });

    it("errors with unknown creature type", () => {
      const ctx = makeCtx({
        args: ["unknown_creature"],
        rawArgs: "unknown_creature",
      });
      execCmd("spawn", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("Unknown creature");
    });

    it("errors with no args", () => {
      const ctx = makeCtx({ args: [], rawArgs: "" });
      execCmd("spawn", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });

    it("uses player level as default when level not specified", () => {
      player1.level = 7;
      const ctx = makeCtx({
        player: player1,
        args: ["zombie"],
        rawArgs: "zombie",
      });
      execCmd("spawn", ctx);
      const firstCall = (mockBridge.spawnCreature as any).mock.calls[0];
      expect(firstCall[3]).toBe(7);
    });
  });

  // ── /god ────────────────────────────────────────────────────────────────

  describe("/god", () => {
    it("enables god mode", () => {
      const ctx = makeCtx({ player: player1, args: [], rawArgs: "" });
      execCmd("god", ctx);
      expect(player1.godMode).toBe(true);
      expect(player1.pacifist).toBe(false);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("ON");
    });

    it("enables god mode with pacifist", () => {
      const ctx = makeCtx({ player: player1, args: ["pacifist"], rawArgs: "pacifist" });
      execCmd("god", ctx);
      expect(player1.godMode).toBe(true);
      expect(player1.pacifist).toBe(true);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("pacifist");
    });

    it("toggles god mode off when already on", () => {
      player1.godMode = true;
      player1.pacifist = true;
      const ctx = makeCtx({ player: player1, args: [], rawArgs: "" });
      execCmd("god", ctx);
      expect(player1.godMode).toBe(false);
      expect(player1.pacifist).toBe(false);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
      const text = (ctx.reply as any).mock.calls[0][0] as string;
      expect(text).toContain("OFF");
    });

    it("heals to full HP on toggle", () => {
      player1.health = 30;
      player1.maxHealth = 100;
      const ctx = makeCtx({ player: player1, args: [], rawArgs: "" });
      execCmd("god", ctx);
      expect(player1.health).toBe(100);
    });
  });

  // ── /setlevel edge cases ───────────────────────────────────────────────

  describe("/setlevel edge cases", () => {
    it("errors when single number arg but no player target", () => {
      // getPlayerTarget returns null (no target selected)
      mockBridge.getPlayerTarget = () => null;
      const ctx = makeCtx({
        args: ["5"],
        rawArgs: "5",
      });
      execCmd("setlevel", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
    });

    it("errors when name arg not found by findPlayerByName", () => {
      const ctx = makeCtx({
        args: ["Ghost", "10"],
        rawArgs: "Ghost 10",
      });
      execCmd("setlevel", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("not found");
    });

    it("sends TALENT_STATE on level-down that triggers talent reset", () => {
      // Set player to level 10 with talents, then setlevel to 5 (level-down resets talents)
      player2.level = 10;
      player2.talentAllocations.set("t1", 1);
      player2.talentAllocations.set("t2", 2);

      const ctx = makeCtx({
        args: ["Bob", "5"],
        rawArgs: "Bob 5",
        resolveTarget: () => ({ sessionId: "s2", player: player2 }),
      });
      execCmd("setlevel", ctx);

      expect(player2.level).toBe(5);
      // Should have sent TALENT_STATE because talents were reset on level-down
      const talentCall = (mockBridge.sendToClient as any).mock.calls.find(
        (c: any) => c[1] === MessageType.TALENT_STATE,
      );
      expect(talentCall).toBeTruthy();
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });
  });

  // ── /give via current target ──────────────────────────────────────────

  describe("/give via current target (no name arg)", () => {
    it("gives item to current player target when only itemId provided", () => {
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["potion"],
        rawArgs: "potion",
      });
      execCmd("give", ctx);
      expect(player2.countItem("potion")).toBe(1);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });
  });

  // ── /spawn NaN edge case ──────────────────────────────────────────────

  describe("/spawn NaN args", () => {
    it("errors when level is not a number", () => {
      const ctx = makeCtx({
        player: player1,
        args: ["zombie", "abc"],
        rawArgs: "zombie abc",
      });
      execCmd("spawn", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("numbers");
    });

    it("errors when count is not a number", () => {
      const ctx = makeCtx({
        player: player1,
        args: ["zombie", "5", "xyz"],
        rawArgs: "zombie 5 xyz",
      });
      execCmd("spawn", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("numbers");
    });
  });

  // ── /give via current target (no name arg) — deeper coverage ─────────────

  describe("/give via target with no name in args", () => {
    it("gives item to player target when first arg is not a player name", () => {
      // getPlayerTarget returns s2, and findPlayerByName("potion") returns null
      mockBridge.getPlayerTarget = () => "s2";
      const ctx = makeCtx({
        args: ["potion"],
        rawArgs: "potion",
      });
      execCmd("give", ctx);
      expect(player2.countItem("potion")).toBe(1);
      expect(ctx.reply).toHaveBeenCalledTimes(1);
    });

    it("errors when no player target and first arg is not a player name", () => {
      // No player target selected
      mockBridge.getPlayerTarget = () => null;
      const ctx = makeCtx({
        args: ["potion"],
        rawArgs: "potion",
      });
      execCmd("give", ctx);
      expect(ctx.replyError).toHaveBeenCalledTimes(1);
      const errText = (ctx.replyError as any).mock.calls[0][0] as string;
      expect(errText).toContain("Usage");
    });
  });
});
