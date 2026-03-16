import type { Client } from "colyseus";
import type { ChatSystem, ChatRoomBridge } from "./ChatSystem";
import type { CommandContext } from "./CommandRegistry";
import type { PlayerState } from "../state/PlayerState";
import { MAX_LEVEL } from "@dungeon/shared";
import { notifyLevelProgress } from "./notifyLevelProgress";
import { resetTutorials } from "../tutorials/resetTutorials";
import { getItemDef } from "../items/ItemRegistry";

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
      ctx.reply("Available commands:\n" + lines.join("\n"));
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
      ctx.reply(`Players (${players.size}):\n${lines.join("\n")}`);
    },
  });

  // ── Admin commands ────────────────────────────────────────────────────────

  registry.register({
    name: "kill",
    usage: "/kill <player>",
    description: "Kill a player",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) {
        ctx.replyError("Usage: /kill <player_name>", "cmd.usageKill");
        return;
      }
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) {
        ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
          name: ctx.args[0],
        });
        return;
      }
      target.player.health = 0;
      chat.broadcastSystemI18n(
        "chat.killedByAdmin",
        { name: target.player.characterName },
        `${target.player.characterName} has been slain by divine intervention!`,
      );
    },
  });

  registry.register({
    name: "heal",
    usage: "/heal [player]",
    description: "Heal a player to full HP (self if omitted)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      let target: { player: PlayerState; sessionId: string };
      if (ctx.args[0]) {
        const found = bridge.findPlayerByName(ctx.args[0]);
        if (!found) {
          ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
            name: ctx.args[0],
          });
          return;
        }
        target = found;
      } else {
        target = { player: ctx.player, sessionId: ctx.sessionId };
      }
      target.player.health = target.player.maxHealth;
      ctx.reply(`Healed ${target.player.characterName} to full HP.`, "cmd.healed", {
        name: target.player.characterName,
      });
    },
  });

  registry.register({
    name: "tp",
    usage: "/tp <player>",
    description: "Teleport to a player",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) {
        ctx.replyError("Usage: /tp <player_name>", "cmd.usageTp");
        return;
      }
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) {
        ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
          name: ctx.args[0],
        });
        return;
      }
      ctx.player.x = target.player.x;
      ctx.player.z = target.player.z;
      ctx.player.path = [];
      ctx.player.currentPathIndex = 0;
      ctx.player.isMoving = false;
      ctx.reply(`Teleported to ${target.player.characterName}.`, "cmd.teleported", {
        name: target.player.characterName,
      });
    },
  });

  registry.register({
    name: "leader",
    usage: "/leader <player>",
    description: "Transfer party leadership to a player",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) {
        ctx.replyError("Usage: /leader <player_name>", "cmd.usageLeader");
        return;
      }
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) {
        ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
          name: ctx.args[0],
        });
        return;
      }
      if (target.player.isLeader) {
        ctx.replyError(
          `${target.player.characterName} is already the leader.`,
          "cmd.alreadyLeader",
          { name: target.player.characterName },
        );
        return;
      }
      const players = bridge.getAllPlayers();
      players.forEach((p) => {
        p.isLeader = false;
      });
      target.player.isLeader = true;
      chat.broadcastSystemI18n(
        "chat.leaderChanged",
        { name: target.player.characterName },
        `${target.player.characterName} is now the party leader.`,
      );
    },
  });

  registry.register({
    name: "setlevel",
    usage: "/setlevel <player> <level>",
    description: "Set a player's level (1-30)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0] || !ctx.args[1]) {
        ctx.replyError("Usage: /setlevel <player_name> <level>", "cmd.usageSetlevel");
        return;
      }
      const targetLevel = parseInt(ctx.args[1], 10);
      if (isNaN(targetLevel) || targetLevel < 1 || targetLevel > MAX_LEVEL) {
        ctx.replyError(`Level must be between 1 and ${MAX_LEVEL}.`, "cmd.invalidLevel", {
          max: MAX_LEVEL,
        });
        return;
      }
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) {
        ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
          name: ctx.args[0],
        });
        return;
      }

      target.player.setLevel(targetLevel);

      // Notify the target player about stat points and tutorial (no public broadcast)
      notifyLevelProgress(
        target.sessionId,
        target.player,
        [],
        chat,
        bridge.sendToClient.bind(bridge),
      );

      ctx.reply(`Set ${target.player.characterName} to level ${targetLevel}.`, "cmd.setLevel", {
        name: target.player.characterName,
        level: targetLevel,
      });
    },
  });

  registry.register({
    name: "kick",
    usage: "/kick <player>",
    description: "Kick a player from the room",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) {
        ctx.replyError("Usage: /kick <player_name>", "cmd.usageKick");
        return;
      }
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) {
        ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
          name: ctx.args[0],
        });
        return;
      }
      const targetClient = findClient(bridge, target.sessionId);
      if (targetClient) {
        const name = target.player.characterName;
        // Clean up player state BEFORE disconnecting
        bridge.kickPlayer(target.sessionId);
        chat.broadcastSystemI18n("chat.kicked", { name }, `${name} has been kicked.`);
        targetClient.leave(4101);
      }
    },
  });

  registry.register({
    name: "resettutorials",
    usage: "/resettutorials <player>",
    description: "Reset all completed tutorials for a player",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) {
        ctx.replyError("Usage: /resettutorials <player_name>", "cmd.usageResettutorials");
        return;
      }
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) {
        ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
          name: ctx.args[0],
        });
        return;
      }

      const count = resetTutorials(
        target.player,
        target.sessionId,
        bridge.sendToClient.bind(bridge),
      );

      ctx.reply(
        `Reset ${count} tutorial(s) for ${target.player.characterName}.`,
        "cmd.resetTutorials",
        { name: target.player.characterName, count },
      );
    },
  });

  registry.register({
    name: "give",
    usage: "/give <player> <item_id> [quantity]",
    description: "Give an item to a player",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0] || !ctx.args[1]) {
        ctx.replyError("Usage: /give <player_name> <item_id> [quantity]", "cmd.usageGive");
        return;
      }
      const target = bridge.findPlayerByName(ctx.args[0]);
      if (!target) {
        ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
          name: ctx.args[0],
        });
        return;
      }
      const itemId = ctx.args[1];
      const def = getItemDef(itemId);
      if (!def) {
        ctx.replyError(`Unknown item: ${itemId}`, "cmd.itemNotFound", { id: itemId });
        return;
      }
      const qty = ctx.args[2] ? parseInt(ctx.args[2], 10) : 1;
      if (isNaN(qty) || qty < 1) {
        ctx.replyError("Quantity must be a positive number.", "cmd.invalidQuantity");
        return;
      }
      const added = target.player.addItem(itemId, qty, def.maxStack);
      if (added === 0) {
        ctx.replyError(`${target.player.characterName}'s inventory is full.`, "cmd.inventoryFull", {
          name: target.player.characterName,
        });
        return;
      }
      // Notify the receiving player
      chat.sendSystemI18nTo(
        target.sessionId,
        "chat.itemPickup",
        { item: def.name, amount: added },
        `+${added} ${itemId}`,
      );
      ctx.reply(`Gave ${added}× ${itemId} to ${target.player.characterName}.`, "cmd.gaveItem", {
        amount: added,
        item: itemId,
        name: target.player.characterName,
      });
    },
  });
}

/** Find a Colyseus Client by sessionId from the room's clients list. */
function findClient(bridge: ChatRoomBridge, sessionId: string): Client | undefined {
  for (const client of bridge.getClients()) {
    if (client.sessionId === sessionId) return client;
  }
  return undefined;
}
