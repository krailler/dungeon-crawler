import type { Client } from "colyseus";
import type { ChatSystem, ChatRoomBridge } from "./ChatSystem";
import type { CommandContext } from "./CommandRegistry";
import type { PlayerState } from "../state/PlayerState";
import { MAX_LEVEL, LifeState, MessageType } from "@dungeon/shared";
import { getTalentsForClass } from "../talents/TalentRegistry";
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
    usage: "/kill [player]",
    description: "Kill a player (or current target)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      const target = ctx.resolveTarget();
      if (!target) {
        ctx.replyError("Usage: /kill <player_name>", "cmd.usageKill");
        return;
      }
      bridge.killPlayer(target.sessionId);
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
    description: "Heal a player to full HP (target or self if omitted)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      const target = ctx.resolveTarget() ?? { player: ctx.player, sessionId: ctx.sessionId };
      if (target.player.lifeState !== LifeState.ALIVE) {
        ctx.replyError(
          `${target.player.characterName} is not alive. Use /revive first.`,
          "cmd.notAlive",
          { name: target.player.characterName },
        );
        return;
      }
      target.player.health = target.player.maxHealth;
      ctx.reply(`Healed ${target.player.characterName} to full HP.`, "cmd.healed", {
        name: target.player.characterName,
      });
    },
  });

  registry.register({
    name: "revive",
    usage: "/revive [player]",
    description: "Revive a downed/dead player (or current target)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      const target = ctx.resolveTarget();
      if (!target) {
        ctx.replyError("Usage: /revive <player_name>", "cmd.usageRevive");
        return;
      }
      if (target.player.lifeState === LifeState.ALIVE) {
        ctx.replyError(`${target.player.characterName} is already alive.`, "cmd.alreadyAlive", {
          name: target.player.characterName,
        });
        return;
      }
      const success = bridge.revivePlayer(target.sessionId);
      if (success) {
        chat.broadcastSystemI18n(
          "chat.adminRevived",
          { name: target.player.characterName },
          `${target.player.characterName} has been revived by divine intervention!`,
        );
      }
    },
  });

  registry.register({
    name: "tp",
    usage: "/tp [player]",
    description: "Teleport to a player (or current target)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      const target = ctx.resolveTarget();
      if (!target) {
        ctx.replyError("Usage: /tp <player_name>", "cmd.usageTp");
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
    usage: "/leader [player]",
    description: "Transfer party leadership (or current target)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      const target = ctx.resolveTarget();
      if (!target) {
        ctx.replyError("Usage: /leader <player_name>", "cmd.usageLeader");
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
    usage: "/setlevel [player] <level>",
    description: "Set a player's level (or current target)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      let target: { sessionId: string; player: PlayerState } | null;
      let levelStr: string | undefined;

      // If only one arg and it's a number, use target for player
      if (ctx.args[0] && !ctx.args[1] && !isNaN(parseInt(ctx.args[0], 10))) {
        levelStr = ctx.args[0];
        // Resolve from current target (resolveTarget checks args[0] first which is the number, not a name)
        const targetSessionId = bridge.getPlayerTarget(ctx.sessionId);
        if (targetSessionId) {
          const p = bridge.getPlayer(targetSessionId);
          target = p ? { sessionId: targetSessionId, player: p } : null;
        } else {
          target = null;
        }
      } else if (ctx.args[0] && ctx.args[1]) {
        levelStr = ctx.args[1];
        target = bridge.findPlayerByName(ctx.args[0]);
        if (!target) {
          ctx.replyError(`Player not found: ${ctx.args[0]}`, "cmd.playerNotFound", {
            name: ctx.args[0],
          });
          return;
        }
      } else {
        ctx.replyError("Usage: /setlevel [player_name] <level>", "cmd.usageSetlevel");
        return;
      }

      if (!target) {
        ctx.replyError("Usage: /setlevel [player_name] <level>", "cmd.usageSetlevel");
        return;
      }

      const targetLevel = parseInt(levelStr, 10);
      if (isNaN(targetLevel) || targetLevel < 1 || targetLevel > MAX_LEVEL) {
        ctx.replyError(`Level must be between 1 and ${MAX_LEVEL}.`, "cmd.invalidLevel", {
          max: MAX_LEVEL,
        });
        return;
      }

      target.player.setLevel(targetLevel);
      // Recompute stats with talents cleared
      bridge.recomputePlayerStats(target.player);

      // Notify the target player about stat/talent points and tutorials (no public broadcast)
      notifyLevelProgress(
        target.sessionId,
        target.player,
        [],
        chat,
        bridge.sendToClient.bind(bridge),
      );

      // Send updated (empty) talent allocations to client
      const classTalentIds = getTalentsForClass(target.player.classId).map((t) => t.id);
      bridge.sendToClient(target.sessionId, MessageType.TALENT_STATE, {
        allocations: [],
        classTalentIds,
      });

      ctx.reply(`Set ${target.player.characterName} to level ${targetLevel}.`, "cmd.setLevel", {
        name: target.player.characterName,
        level: targetLevel,
      });
    },
  });

  registry.register({
    name: "kick",
    usage: "/kick [player]",
    description: "Kick a player (or current target)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      const target = ctx.resolveTarget();
      if (!target) {
        ctx.replyError("Usage: /kick <player_name>", "cmd.usageKick");
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
    usage: "/resettutorials [player]",
    description: "Reset tutorials (or current target)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      const target = ctx.resolveTarget();
      if (!target) {
        ctx.replyError("Usage: /resettutorials <player_name>", "cmd.usageResettutorials");
        return;
      }

      const count = resetTutorials(
        target.player,
        target.sessionId,
        bridge.sendToClient.bind(bridge),
        bridge.isDungeonStarted(),
      );

      ctx.reply(
        `Reset ${count} tutorial(s) for ${target.player.characterName}.`,
        "cmd.resetTutorials",
        { name: target.player.characterName, count },
      );
    },
  });

  registry.register({
    name: "resettalents",
    usage: "/resettalents [player]",
    description: "Reset talent allocations and refund points",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      const target = ctx.resolveTarget();
      if (!target) {
        ctx.replyError("Usage: /resettalents <player_name>", "cmd.usageResettalents");
        return;
      }

      const count = target.player.resetTalents();
      // Recompute stats since talent bonuses were removed
      bridge.recomputePlayerStats(target.player);

      ctx.reply(
        `Reset ${count} talent(s) for ${target.player.characterName}. ${target.player.talentPoints} point(s) refunded.`,
        "cmd.resetTalents",
        { name: target.player.characterName, count, points: target.player.talentPoints },
      );

      // Notify client about updated (empty) allocations
      const classTalentIds = getTalentsForClass(target.player.classId).map((t) => t.id);
      bridge.sendToClient(target.sessionId, MessageType.TALENT_STATE, {
        allocations: [],
        classTalentIds,
      });
    },
  });

  registry.register({
    name: "give",
    usage: "/give [player] <item_id> [quantity]",
    description: "Give an item (target if no player specified)",
    adminOnly: true,
    handler: (ctx: CommandContext) => {
      if (!ctx.args[0]) {
        ctx.replyError("Usage: /give [player_name] <item_id> [quantity]", "cmd.usageGive");
        return;
      }

      let target: { sessionId: string; player: PlayerState } | null;
      let itemId: string;
      let qtyStr: string | undefined;

      // Try first arg as player name; if not found, treat it as item_id and use target
      const byName = bridge.findPlayerByName(ctx.args[0]);
      if (byName && ctx.args[1]) {
        // /give playerName itemId [qty]
        target = byName;
        itemId = ctx.args[1];
        qtyStr = ctx.args[2];
      } else {
        // /give itemId [qty] — use current target
        const targetSessionId = bridge.getPlayerTarget(ctx.sessionId);
        if (targetSessionId) {
          const p = bridge.getPlayer(targetSessionId);
          target = p ? { sessionId: targetSessionId, player: p } : null;
        } else {
          target = null;
        }
        itemId = ctx.args[0];
        qtyStr = ctx.args[1];
      }

      if (!target) {
        ctx.replyError("Usage: /give [player_name] <item_id> [quantity]", "cmd.usageGive");
        return;
      }

      const def = getItemDef(itemId);
      if (!def) {
        ctx.replyError(`Unknown item: ${itemId}`, "cmd.itemNotFound", { id: itemId });
        return;
      }
      const qty = qtyStr ? parseInt(qtyStr, 10) : 1;
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
