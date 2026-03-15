import { ChatCategory } from "@dungeon/shared";
import type { ChatSystem, ChatRoomBridge } from "./ChatSystem";
import type { CommandContext } from "./CommandRegistry";

/**
 * Register all built-in slash commands.
 * Called once in DungeonRoom.onCreate().
 */
export function registerCommands(chat: ChatSystem, bridge: ChatRoomBridge): void {
  const registry = chat.getRegistry();

  // ── Public commands ───────────────────────────────────────────────────────

  registry.register({
    name: "help",
    usage: "/help",
    description: "Show available commands",
    adminOnly: false,
    handler: (ctx: CommandContext) => {
      const cmds = chat.getCommandsForRole(ctx.role);
      const lines = cmds.map((c) => `  ${c.usage} — ${c.description}`);
      const client = findClient(bridge, ctx.sessionId);
      if (client) {
        chat.sendToClient(client, ChatCategory.COMMAND, "Available commands:\n" + lines.join("\n"));
      }
    },
  });

  registry.register({
    name: "players",
    usage: "/players",
    description: "List connected players",
    adminOnly: false,
    handler: (ctx: CommandContext) => {
      const players = bridge.getAllPlayers();
      const lines: string[] = [];
      players.forEach((p, sid) => {
        const status = p.online ? "online" : "offline";
        const hp = `${Math.ceil(p.health)}/${p.maxHealth}`;
        lines.push(`  ${p.characterName || sid.slice(0, 6)} — ${hp} HP (${status})`);
      });
      const client = findClient(bridge, ctx.sessionId);
      if (client) {
        chat.sendToClient(
          client,
          ChatCategory.COMMAND,
          `Players (${players.size}):\n${lines.join("\n")}`,
        );
      }
    },
  });

  // ── Admin commands ────────────────────────────────────────────────────────

  registry.register({
    name: "kill",
    usage: "/kill <player>",
    description: "Kill a player",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) throw new Error("Usage: /kill <player_name>");
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) throw new Error(`Player not found: ${ctx.args[0]}`);
      target.player.health = 0;
      chat.broadcastSystem(`${target.player.characterName} has been slain by divine intervention!`);
    },
  });

  registry.register({
    name: "heal",
    usage: "/heal [player]",
    description: "Heal a player to full HP (self if omitted)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      let target: { player: import("../state/PlayerState").PlayerState; sessionId: string };
      if (ctx.args[0]) {
        const found = bridge.findPlayerByName(ctx.args[0]);
        if (!found) throw new Error(`Player not found: ${ctx.args[0]}`);
        target = found;
      } else {
        target = { player: ctx.player, sessionId: ctx.sessionId };
      }
      target.player.health = target.player.maxHealth;
      const client = findClient(bridge, ctx.sessionId);
      if (client) {
        chat.sendToClient(
          client,
          ChatCategory.COMMAND,
          `Healed ${target.player.characterName} to full HP.`,
        );
      }
    },
  });

  registry.register({
    name: "tp",
    usage: "/tp <player>",
    description: "Teleport to a player",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) throw new Error("Usage: /tp <player_name>");
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) throw new Error(`Player not found: ${ctx.args[0]}`);
      ctx.player.x = target.player.x;
      ctx.player.z = target.player.z;
      ctx.player.path = [];
      ctx.player.currentPathIndex = 0;
      ctx.player.isMoving = false;
      const client = findClient(bridge, ctx.sessionId);
      if (client) {
        chat.sendToClient(
          client,
          ChatCategory.COMMAND,
          `Teleported to ${target.player.characterName}.`,
        );
      }
    },
  });

  registry.register({
    name: "kick",
    usage: "/kick <player>",
    description: "Kick a player from the room",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) throw new Error("Usage: /kick <player_name>");
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) throw new Error(`Player not found: ${ctx.args[0]}`);
      const targetClient = findClient(bridge, target.sessionId);
      if (targetClient) {
        const name = target.player.characterName;
        // Clean up player state BEFORE disconnecting
        bridge.kickPlayer(target.sessionId);
        chat.broadcastSystem(`${name} has been kicked.`);
        targetClient.leave(4101);
      }
    },
  });
}

/** Find a Colyseus Client by sessionId from the room's clients list. */
function findClient(
  bridge: ChatRoomBridge,
  sessionId: string,
): import("colyseus").Client | undefined {
  for (const client of bridge.getClients()) {
    if (client.sessionId === sessionId) return client;
  }
  return undefined;
}
