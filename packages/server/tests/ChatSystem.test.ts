import { mock, describe, it, expect, beforeEach } from "bun:test";
import { resolve } from "path";

const SRC = resolve(import.meta.dir, "../src");
const m = (rel: string) => resolve(SRC, rel);

const noopLogger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
  child: () => noopLogger,
};
mock.module(m("logger"), () => ({
  logger: noopLogger,
  createRoomLogger: () => noopLogger,
  pid: (s: string) => s.slice(0, 6),
}));
mock.module(m("logger.ts"), () => ({
  logger: noopLogger,
  createRoomLogger: () => noopLogger,
  pid: (s: string) => s.slice(0, 6),
}));

import { ChatSystem } from "../src/chat/ChatSystem.js";
import type { ChatRoomBridge } from "../src/chat/ChatSystem.js";
import { ChatCategory, ChatVariant, CHAT_RATE_LIMIT_BURST, MessageType } from "@dungeon/shared";
import type { ChatEntry } from "@dungeon/shared";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeMockClient(sessionId: string) {
  return {
    sessionId,
    send: mock(() => {}),
  };
}

function makeMockPlayer(name: string) {
  return { characterName: name } as any;
}

function makeBridge(
  clients: ReturnType<typeof makeMockClient>[],
  players: Map<string, any> = new Map(),
): ChatRoomBridge & { sendToClient: ReturnType<typeof mock> } {
  const sendToClient = mock(() => {});
  return {
    getClients: () => clients as any,
    getPlayer: (sid: string) => players.get(sid),
    getPlayerRole: () => "user",
    getPlayerName: (c: any) => players.get(c.sessionId)?.characterName ?? "Unknown",
    findPlayerByName: () => null,
    getAllPlayers: () => players,
    sendToClient,
    kickPlayer: () => {},
    isDungeonStarted: () => false,
    killPlayer: () => {},
    revivePlayer: () => false,
    getPlayerTarget: () => null,
    getCreatureTarget: () => null,
    killCreature: () => {},
    recomputePlayerStats: () => {},
    spawnCreature: () => null,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ChatSystem", () => {
  let c1: ReturnType<typeof makeMockClient>;
  let c2: ReturnType<typeof makeMockClient>;
  let bridge: ReturnType<typeof makeBridge>;
  let chat: ChatSystem;

  beforeEach(() => {
    c1 = makeMockClient("s1");
    c2 = makeMockClient("s2");
    const players = new Map<string, any>([
      ["s1", makeMockPlayer("Alice")],
      ["s2", makeMockPlayer("Bob")],
    ]);
    bridge = makeBridge([c1, c2], players);
    chat = new ChatSystem(bridge);
  });

  // ── broadcastSystem ────────────────────────────────────────────────────────

  describe("broadcastSystem", () => {
    it("sends a SYSTEM variant message to all clients", () => {
      chat.broadcastSystem("Server restarting");

      expect(c1.send).toHaveBeenCalledTimes(1);
      expect(c2.send).toHaveBeenCalledTimes(1);

      const entry = c1.send.mock.calls[0] as [string, ChatEntry];
      expect(entry[0]).toBe(MessageType.CHAT_ENTRY);
      expect(entry[1].category).toBe(ChatCategory.MESSAGE);
      expect(entry[1].variant).toBe(ChatVariant.SYSTEM);
      expect(entry[1].text).toBe("Server restarting");
    });

    it("increments message id on each call", () => {
      chat.broadcastSystem("a");
      chat.broadcastSystem("b");

      const id1 = (c1.send.mock.calls[0] as [string, ChatEntry])[1].id;
      const id2 = (c1.send.mock.calls[1] as [string, ChatEntry])[1].id;
      expect(id2).toBe(id1 + 1);
    });
  });

  // ── broadcastSystemI18n ────────────────────────────────────────────────────

  describe("broadcastSystemI18n", () => {
    it("sends i18n key + params + fallback to all clients", () => {
      chat.broadcastSystemI18n("chat.joined", { name: "Alice" }, "Alice joined");

      expect(c1.send).toHaveBeenCalledTimes(1);
      expect(c2.send).toHaveBeenCalledTimes(1);

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.i18nKey).toBe("chat.joined");
      expect(entry.i18nParams).toEqual({ name: "Alice" });
      expect(entry.text).toBe("Alice joined");
      expect(entry.variant).toBe(ChatVariant.SYSTEM);
    });
  });

  // ── broadcastSystemI18nExcept ──────────────────────────────────────────────

  describe("broadcastSystemI18nExcept", () => {
    it("sends to all clients except the excluded one", () => {
      chat.broadcastSystemI18nExcept("s1", "chat.left", { name: "Alice" }, "Alice left");

      expect(c1.send).toHaveBeenCalledTimes(0);
      expect(c2.send).toHaveBeenCalledTimes(1);

      const entry = (c2.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.i18nKey).toBe("chat.left");
      expect(entry.text).toBe("Alice left");
    });
  });

  // ── sendSystemI18nTo ───────────────────────────────────────────────────────

  describe("sendSystemI18nTo", () => {
    it("sends to a specific client via bridge.sendToClient", () => {
      chat.sendSystemI18nTo("s2", "chat.welcome", { dungeon: "Crypt" }, "Welcome to Crypt");

      expect(bridge.sendToClient).toHaveBeenCalledTimes(1);
      const [sid, type, entry] = bridge.sendToClient.mock.calls[0] as [string, string, ChatEntry];
      expect(sid).toBe("s2");
      expect(type).toBe(MessageType.CHAT_ENTRY);
      expect(entry.i18nKey).toBe("chat.welcome");
      expect(entry.i18nParams).toEqual({ dungeon: "Crypt" });
      expect(entry.variant).toBe(ChatVariant.SYSTEM);
    });
  });

  // ── handleMessage: chat vs command routing ─────────────────────────────────

  describe("handleMessage", () => {
    it("broadcasts a PLAYER chat message for normal text", () => {
      chat.handleMessage(c1 as any, "Hello world");

      expect(c1.send).toHaveBeenCalledTimes(1);
      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.category).toBe(ChatCategory.PLAYER);
      expect(entry.sender).toBe("Alice");
      expect(entry.text).toBe("Hello world");
    });

    it("ignores empty/whitespace-only messages", () => {
      chat.handleMessage(c1 as any, "   ");
      expect(c1.send).toHaveBeenCalledTimes(0);
      expect(c2.send).toHaveBeenCalledTimes(0);
    });

    it("routes commands (starting with /) to the command handler", () => {
      // Unknown command should produce an error reply, not a broadcast
      chat.handleMessage(c1 as any, "/nonexistent");

      expect(c1.send).toHaveBeenCalledTimes(1);
      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.variant).toBe(ChatVariant.ERROR);
      expect(entry.i18nKey).toBe("chat.unknownCommand");
    });

    it("rejects messages exceeding CHAT_MAX_LENGTH", () => {
      const longMsg = "a".repeat(201);
      chat.handleMessage(c1 as any, longMsg);

      expect(c1.send).toHaveBeenCalledTimes(1);
      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.variant).toBe(ChatVariant.ERROR);
      expect(entry.i18nKey).toBe("chat.messageTooLong");
    });
  });

  // ── Rate limiting ──────────────────────────────────────────────────────────

  describe("rate limiting", () => {
    it(`rejects after ${CHAT_RATE_LIMIT_BURST} rapid messages`, () => {
      // Send BURST messages — all should succeed
      for (let i = 0; i < CHAT_RATE_LIMIT_BURST; i++) {
        chat.handleMessage(c1 as any, `msg${i}`);
      }
      // All clients should have received BURST broadcasts
      expect(c1.send).toHaveBeenCalledTimes(CHAT_RATE_LIMIT_BURST);

      // Clear mocks and send one more — should be rate limited
      c1.send.mockClear();
      c2.send.mockClear();
      chat.handleMessage(c1 as any, "one too many");

      // Only c1 gets the error, c2 gets nothing (no broadcast)
      expect(c1.send).toHaveBeenCalledTimes(1);
      expect(c2.send).toHaveBeenCalledTimes(0);

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.variant).toBe(ChatVariant.ERROR);
      expect(entry.i18nKey).toBe("chat.rateLimited");
    });

    it("commands bypass rate limiting", () => {
      // Exhaust rate limit
      for (let i = 0; i < CHAT_RATE_LIMIT_BURST; i++) {
        chat.handleMessage(c1 as any, `msg${i}`);
      }
      c1.send.mockClear();

      // Command should still go through (unknown command = error reply, but NOT rate-limited)
      chat.handleMessage(c1 as any, "/help");
      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      // It should be an unknown command error, not a rate limit error
      expect(entry.i18nKey).toBe("chat.unknownCommand");
    });
  });

  // ── removePlayer ───────────────────────────────────────────────────────────

  describe("removePlayer", () => {
    it("clears rate limit data so the player can chat freely on rejoin", () => {
      // Exhaust rate limit
      for (let i = 0; i < CHAT_RATE_LIMIT_BURST; i++) {
        chat.handleMessage(c1 as any, `msg${i}`);
      }
      c1.send.mockClear();
      c2.send.mockClear();

      // Verify rate limited
      chat.handleMessage(c1 as any, "blocked");
      expect((c1.send.mock.calls[0] as [string, ChatEntry])[1].i18nKey).toBe("chat.rateLimited");

      c1.send.mockClear();
      c2.send.mockClear();

      // Remove and re-send — should work
      chat.removePlayer("s1");
      chat.handleMessage(c1 as any, "I'm back");

      expect(c1.send).toHaveBeenCalledTimes(1);
      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.category).toBe(ChatCategory.PLAYER);
      expect(entry.text).toBe("I'm back");
    });
  });

  // ── broadcastAnnouncement ──────────────────────────────────────────────────

  describe("broadcastAnnouncement", () => {
    it("sends ANNOUNCEMENT category to all clients", () => {
      chat.broadcastAnnouncement("announce.gate", { seconds: 3 }, "Gate opening in 3");

      expect(c1.send).toHaveBeenCalledTimes(1);
      expect(c2.send).toHaveBeenCalledTimes(1);

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.category).toBe(ChatCategory.ANNOUNCEMENT);
      expect(entry.i18nKey).toBe("announce.gate");
      expect(entry.i18nParams).toEqual({ seconds: 3 });
      expect(entry.text).toBe("Gate opening in 3");
    });

    it("includes variant when provided", () => {
      chat.broadcastAnnouncement("a.key", {}, "text", ChatVariant.ERROR);

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.variant).toBe(ChatVariant.ERROR);
    });
  });

  // ── sendAnnouncementTo ─────────────────────────────────────────────────────

  describe("sendAnnouncementTo", () => {
    it("sends ANNOUNCEMENT to a single client", () => {
      chat.sendAnnouncementTo(c1 as any, "announce.welcome", { name: "Alice" }, "Welcome Alice");

      expect(c1.send).toHaveBeenCalledTimes(1);
      expect(c2.send).toHaveBeenCalledTimes(0);

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.category).toBe(ChatCategory.ANNOUNCEMENT);
      expect(entry.i18nKey).toBe("announce.welcome");
      expect(entry.text).toBe("Welcome Alice");
    });
  });

  // ── sendToClient ───────────────────────────────────────────────────────────

  describe("sendToClient", () => {
    it("sends a message with category and variant to one client", () => {
      chat.sendToClient(c2 as any, ChatCategory.MESSAGE, "You died", ChatVariant.ERROR);

      expect(c2.send).toHaveBeenCalledTimes(1);
      expect(c1.send).toHaveBeenCalledTimes(0);

      const entry = (c2.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.category).toBe(ChatCategory.MESSAGE);
      expect(entry.text).toBe("You died");
      expect(entry.variant).toBe(ChatVariant.ERROR);
    });
  });

  // ── getCommandsForRole ─────────────────────────────────────────────────────

  describe("getCommandsForRole", () => {
    it("delegates to registry.getAvailable", () => {
      // Register a command first
      chat.getRegistry().register({
        name: "test",
        usage: "/test",
        description: "A test command",
        adminOnly: false,
        handler: () => {},
      });

      const cmds = chat.getCommandsForRole("user");
      expect(cmds.length).toBeGreaterThan(0);
      expect(cmds.find((c) => c.name === "test")).toBeDefined();
    });
  });

  // ── handleCommand: ctx.reply / replyError / resolveTarget ──────────────────

  describe("handleCommand (registered command execution)", () => {
    it("ctx.reply with i18nKey sends i18n message to client", () => {
      chat.getRegistry().register({
        name: "testcmd",
        usage: "/testcmd",
        description: "test",
        adminOnly: false,
        handler: (ctx) => ctx.reply("done", "cmd.done", { x: 1 }),
      });

      chat.handleMessage(c1 as any, "/testcmd");

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.i18nKey).toBe("cmd.done");
      expect(entry.i18nParams).toEqual({ x: 1 });
      expect(entry.text).toBe("done");
    });

    it("ctx.reply without i18nKey sends plain text", () => {
      chat.getRegistry().register({
        name: "plaincmd",
        usage: "/plaincmd",
        description: "test",
        adminOnly: false,
        handler: (ctx) => ctx.reply("just text"),
      });

      chat.handleMessage(c1 as any, "/plaincmd");

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.text).toBe("just text");
      expect(entry.i18nKey).toBeUndefined();
    });

    it("ctx.replyError with i18nKey sends error variant i18n message", () => {
      chat.getRegistry().register({
        name: "errcmd",
        usage: "/errcmd",
        description: "test",
        adminOnly: false,
        handler: (ctx) => ctx.replyError("bad input", "cmd.badInput", { field: "x" }),
      });

      chat.handleMessage(c1 as any, "/errcmd");

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.i18nKey).toBe("cmd.badInput");
      expect(entry.variant).toBe(ChatVariant.ERROR);
    });

    it("ctx.replyError without i18nKey sends plain error text", () => {
      chat.getRegistry().register({
        name: "errplain",
        usage: "/errplain",
        description: "test",
        adminOnly: false,
        handler: (ctx) => ctx.replyError("oops"),
      });

      chat.handleMessage(c1 as any, "/errplain");

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.text).toBe("oops");
      expect(entry.variant).toBe(ChatVariant.ERROR);
      expect(entry.i18nKey).toBeUndefined();
    });

    it("ctx.resolveTarget uses first arg as player name", () => {
      let resolved: any = "not called";
      chat.getRegistry().register({
        name: "targetcmd",
        usage: "/targetcmd",
        description: "test",
        adminOnly: false,
        handler: (ctx) => {
          resolved = ctx.resolveTarget();
        },
      });

      // Bridge.findPlayerByName returns null by default
      chat.handleMessage(c1 as any, "/targetcmd Bob");
      expect(resolved).toBeNull();
    });

    it("ctx.resolveTarget falls back to current player target", () => {
      const targetPlayer = makeMockPlayer("Bob");
      let resolved: any = "not called";

      // Override bridge — getPlayer must still return ctx.player for s1
      const players = new Map<string, any>([
        ["s1", makeMockPlayer("Alice")],
        ["s2", targetPlayer],
      ]);
      (bridge as any).getPlayerTarget = (sid: string) => (sid === "s1" ? "s2" : null);
      (bridge as any).getPlayer = (sid: string) => players.get(sid) ?? null;

      chat.getRegistry().register({
        name: "fbcmd",
        usage: "/fbcmd",
        description: "test",
        adminOnly: false,
        handler: (ctx) => {
          resolved = ctx.resolveTarget();
        },
      });

      // No args → resolveTarget falls back to getPlayerTarget
      chat.handleMessage(c1 as any, "/fbcmd");
      expect(resolved).toBeDefined();
      expect(resolved.sessionId).toBe("s2");
      expect(resolved.player.characterName).toBe("Bob");
    });

    it("admin-only command rejected for non-admin", () => {
      chat.getRegistry().register({
        name: "admincmd",
        usage: "/admincmd",
        description: "test",
        adminOnly: true,
        handler: () => {},
      });

      chat.handleMessage(c1 as any, "/admincmd");

      const entry = (c1.send.mock.calls[0] as [string, ChatEntry])[1];
      expect(entry.i18nKey).toBe("chat.adminRequired");
      expect(entry.variant).toBe(ChatVariant.ERROR);
    });

    it("admin-only command executes for admin", () => {
      let executed = false;
      (bridge as any).getPlayerRole = () => "admin";
      chat.getRegistry().register({
        name: "admincmd2",
        usage: "/admincmd2",
        description: "test",
        adminOnly: true,
        handler: () => {
          executed = true;
        },
      });

      chat.handleMessage(c1 as any, "/admincmd2");
      expect(executed).toBe(true);
    });

    it("passes parsed args to command handler", () => {
      let capturedArgs: string[] = [];
      let capturedRaw = "";
      chat.getRegistry().register({
        name: "argcmd",
        usage: "/argcmd",
        description: "test",
        adminOnly: false,
        handler: (ctx) => {
          capturedArgs = ctx.args;
          capturedRaw = ctx.rawArgs;
        },
      });

      chat.handleMessage(c1 as any, "/argcmd foo bar  baz");
      expect(capturedArgs).toEqual(["foo", "bar", "baz"]);
      expect(capturedRaw).toBe("foo bar  baz");
    });
  });
});
