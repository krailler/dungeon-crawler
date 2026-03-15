/** Message types for client ↔ server communication */
export const MessageType = {
  MOVE: "move",
  ADMIN_RESTART: "admin:restart",
  COMBAT_LOG: "combat:log",
  CHAT_SEND: "chat:send",
  CHAT_ENTRY: "chat:entry",
  CHAT_COMMANDS: "chat:commands",
  DEBUG_PATHS: "debug:paths",
  PROMOTE_LEADER: "party:promote",
  GATE_INTERACT: "gate:interact",
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
  MESSAGE: "message",
  /** Center-screen announcement (countdown, boss alerts, etc.) */
  ANNOUNCEMENT: "announcement",
} as const;

/** Optional variant for MESSAGE category to change color/label */
export const ChatVariant = {
  ERROR: "error",
  SYSTEM: "system",
} as const;

export type ChatVariantValue = (typeof ChatVariant)[keyof typeof ChatVariant];

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
  /** Optional visual variant (e.g. "error" for red command responses) */
  variant?: ChatVariantValue;
  /** i18n translation key — if present, client should use t(i18nKey, i18nParams) instead of text */
  i18nKey?: string;
  /** Interpolation params for the i18n key */
  i18nParams?: Record<string, string | number>;
}

// ── Debug ─────────────────────────────────────────────────────────────────────

/** A single entity path for debug visualization */
export interface DebugPathEntry {
  id: string;
  /** "player" or "enemy" */
  kind: "player" | "enemy";
  /** Current position */
  x: number;
  z: number;
  /** Remaining waypoints */
  path: { x: number; z: number }[];
}

/** Payload for DEBUG_PATHS message (Server → Client) */
export interface DebugPathsMessage {
  paths: DebugPathEntry[];
}

// ── Party ─────────────────────────────────────────────────────────────────────

/** Client → Server: promote a player to leader */
export interface PromoteLeaderMessage {
  targetSessionId: string;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

/** Command info sent to client on join for help overlay */
export interface CommandInfo {
  name: string;
  usage: string;
  description: string;
  adminOnly: boolean;
}
