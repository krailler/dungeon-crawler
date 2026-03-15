/** Message types for client ↔ server communication */
export const MessageType = {
  MOVE: "move",
  ADMIN_RESTART: "admin:restart",
  COMBAT_LOG: "combat:log",
  CHAT_SEND: "chat:send",
  CHAT_ENTRY: "chat:entry",
  CHAT_COMMANDS: "chat:commands",
} as const;

/** Custom WebSocket close codes (4xxx range) */
export const CloseCode = {
  KICKED_DUPLICATE: 4100,
  KICKED: 4101,
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];

/** Payload for MOVE message */
export interface MoveMessage {
  x: number;
  z: number;
}

/** Payload for ADMIN_RESTART message */
export interface AdminRestartMessage {
  seed?: number | null;
}

/** Payload for COMBAT_LOG message (Server → Client) */
export interface CombatLogMessage {
  /** "p2e" = player hit enemy, "e2p" = enemy hit player */
  dir: "p2e" | "e2p";
  /** Attacker display name */
  src: string;
  /** Target display name */
  tgt: string;
  /** Raw attack damage */
  atk: number;
  /** Target defense */
  def: number;
  /** Final damage applied */
  dmg: number;
  /** Target HP after hit */
  hp: number;
  /** Target max HP */
  maxHp: number;
  /** Target died from this hit */
  kill: boolean;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

/** Chat message categories for visual formatting */
export const ChatCategory = {
  PLAYER: "player",
  SYSTEM: "system",
  COMMAND: "command",
  ERROR: "error",
} as const;

export type ChatCategoryValue = (typeof ChatCategory)[keyof typeof ChatCategory];

/** Client → Server: player sends chat text or slash command */
export interface ChatSendPayload {
  text: string;
}

/** Server → Client: a formatted chat entry to display */
export interface ChatEntry {
  id: number;
  category: ChatCategoryValue;
  timestamp: number;
  sender?: string;
  senderRole?: string;
  text: string;
}

/** Command info sent to client on join for help overlay */
export interface CommandInfo {
  name: string;
  usage: string;
  description: string;
  adminOnly: boolean;
}
