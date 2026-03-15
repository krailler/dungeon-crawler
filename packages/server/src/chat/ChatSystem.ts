import type { Client } from "colyseus";
import type { PlayerState } from "../state/PlayerState";
import {
  ChatCategory,
  ChatVariant,
  CHAT_MAX_LENGTH,
  CHAT_RATE_LIMIT_BURST,
  CHAT_RATE_LIMIT_WINDOW,
  MessageType,
} from "@dungeon/shared";
import type { ChatEntry, ChatCategoryValue, ChatVariantValue } from "@dungeon/shared";
import { CommandRegistry } from "./CommandRegistry";

export interface ChatRoomBridge {
  getClients(): Iterable<Client>;
  getPlayer(sessionId: string): PlayerState | undefined;
  getPlayerRole(client: Client): string;
  getPlayerName(client: Client): string;
  findPlayerByName(name: string): { sessionId: string; player: PlayerState } | null;
  getAllPlayers(): Map<string, PlayerState>;
  /** Remove a player from all room systems (state, combat, AI, etc.) */
  kickPlayer(sessionId: string): void;
}

export class ChatSystem {
  private registry: CommandRegistry = new CommandRegistry();
  private bridge: ChatRoomBridge;
  private nextId: number = 1;
  private rateLimits: Map<string, number[]> = new Map();

  constructor(bridge: ChatRoomBridge) {
    this.bridge = bridge;
  }

  getRegistry(): CommandRegistry {
    return this.registry;
  }

  /** Main entry point — called from DungeonRoom message handler. */
  handleMessage(client: Client, text: string): void {
    const trimmed = text.trim();
    if (trimmed.length === 0) return;

    // Rate limit check
    if (!this.checkRateLimit(client.sessionId)) {
      this.sendToClientI18n(
        client,
        ChatCategory.COMMAND,
        "chat.rateLimited",
        {},
        "You are sending messages too fast.",
        ChatVariant.ERROR,
      );
      return;
    }

    // Command or chat?
    if (trimmed.startsWith("/")) {
      this.handleCommand(client, trimmed);
    } else {
      this.handleChat(client, trimmed);
    }
  }

  /** Broadcast a system event to all clients (plain text, no i18n). */
  broadcastSystem(text: string): void {
    this.broadcast({
      id: this.nextId++,
      category: ChatCategory.SYSTEM,
      timestamp: Date.now(),
      text,
    });
  }

  /** Broadcast a system event with i18n key so clients translate locally. */
  broadcastSystemI18n(
    i18nKey: string,
    i18nParams: Record<string, string | number>,
    fallbackText: string,
  ): void {
    this.broadcast({
      id: this.nextId++,
      category: ChatCategory.SYSTEM,
      timestamp: Date.now(),
      text: fallbackText,
      i18nKey,
      i18nParams,
    });
  }

  /** Send a message to a single client. */
  sendToClient(
    client: Client,
    category: ChatCategoryValue,
    text: string,
    variant?: ChatVariantValue,
  ): void {
    const entry: ChatEntry = {
      id: this.nextId++,
      category,
      timestamp: Date.now(),
      text,
      variant,
    };
    client.send(MessageType.CHAT_ENTRY, entry);
  }

  /** Send a message with i18n key to a single client. */
  sendToClientI18n(
    client: Client,
    category: ChatCategoryValue,
    i18nKey: string,
    i18nParams: Record<string, string | number>,
    fallbackText: string,
    variant?: ChatVariantValue,
  ): void {
    const entry: ChatEntry = {
      id: this.nextId++,
      category,
      timestamp: Date.now(),
      text: fallbackText,
      variant,
      i18nKey,
      i18nParams,
    };
    client.send(MessageType.CHAT_ENTRY, entry);
  }

  /** Get available commands for a role (sent on join). */
  getCommandsForRole(role: string): ReturnType<CommandRegistry["getAvailable"]> {
    return this.registry.getAvailable(role);
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private handleChat(client: Client, text: string): void {
    if (text.length > CHAT_MAX_LENGTH) {
      this.sendToClientI18n(
        client,
        ChatCategory.COMMAND,
        "chat.messageTooLong",
        { max: CHAT_MAX_LENGTH },
        `Message too long (max ${CHAT_MAX_LENGTH} characters).`,
        ChatVariant.ERROR,
      );
      return;
    }

    const name = this.bridge.getPlayerName(client);
    const role = this.bridge.getPlayerRole(client);

    this.broadcast({
      id: this.nextId++,
      category: ChatCategory.PLAYER,
      timestamp: Date.now(),
      sender: name,
      senderRole: role,
      text,
    });
  }

  private handleCommand(client: Client, raw: string): void {
    // Parse: "/commandName arg1 arg2..."
    const withoutSlash = raw.slice(1);
    const spaceIdx = withoutSlash.indexOf(" ");
    const cmdName = spaceIdx === -1 ? withoutSlash : withoutSlash.slice(0, spaceIdx);
    const rawArgs = spaceIdx === -1 ? "" : withoutSlash.slice(spaceIdx + 1).trim();
    const args = rawArgs.length > 0 ? rawArgs.split(/\s+/) : [];

    const cmd = this.registry.get(cmdName);
    if (!cmd) {
      this.sendToClientI18n(
        client,
        ChatCategory.COMMAND,
        "chat.unknownCommand",
        { name: cmdName },
        `Unknown command: /${cmdName}`,
        ChatVariant.ERROR,
      );
      return;
    }

    const role = this.bridge.getPlayerRole(client);
    if (cmd.adminOnly && role !== "admin") {
      this.sendToClientI18n(
        client,
        ChatCategory.COMMAND,
        "chat.adminRequired",
        {},
        "This command requires admin privileges.",
        ChatVariant.ERROR,
      );
      return;
    }

    const player = this.bridge.getPlayer(client.sessionId);
    if (!player) return;

    const ctx = {
      sessionId: client.sessionId,
      player,
      role,
      args,
      rawArgs,
      reply: (
        fallbackText: string,
        i18nKey?: string,
        i18nParams?: Record<string, string | number>,
      ) => {
        if (i18nKey) {
          this.sendToClientI18n(
            client,
            ChatCategory.COMMAND,
            i18nKey,
            i18nParams ?? {},
            fallbackText,
          );
        } else {
          this.sendToClient(client, ChatCategory.COMMAND, fallbackText);
        }
      },
      replyError: (
        fallbackText: string,
        i18nKey?: string,
        i18nParams?: Record<string, string | number>,
      ) => {
        if (i18nKey) {
          this.sendToClientI18n(
            client,
            ChatCategory.COMMAND,
            i18nKey,
            i18nParams ?? {},
            fallbackText,
            ChatVariant.ERROR,
          );
        } else {
          this.sendToClient(client, ChatCategory.COMMAND, fallbackText, ChatVariant.ERROR);
        }
      },
    };

    cmd.handler(ctx);
  }

  private broadcast(entry: ChatEntry): void {
    for (const client of this.bridge.getClients()) {
      client.send(MessageType.CHAT_ENTRY, entry);
    }
  }

  private checkRateLimit(sessionId: string): boolean {
    const now = Date.now();
    let timestamps = this.rateLimits.get(sessionId);
    if (!timestamps) {
      timestamps = [];
      this.rateLimits.set(sessionId, timestamps);
    }

    // Remove old timestamps outside window
    const cutoff = now - CHAT_RATE_LIMIT_WINDOW;
    while (timestamps.length > 0 && timestamps[0] < cutoff) {
      timestamps.shift();
    }

    if (timestamps.length >= CHAT_RATE_LIMIT_BURST) {
      return false;
    }

    timestamps.push(now);
    return true;
  }

  /** Clean up rate limit data for disconnected player. */
  removePlayer(sessionId: string): void {
    this.rateLimits.delete(sessionId);
  }
}
