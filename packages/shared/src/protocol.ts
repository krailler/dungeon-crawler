import type { SkillIdValue } from "./Skills.js";
import type { AllocatableStatValue } from "./Stats.js";
import type { TutorialStepValue } from "./Tutorial.js";

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
  PARTY_KICK: "party:kick",
  GATE_INTERACT: "gate:interact",
  SKILL_TOGGLE: "skill:toggle",
  SKILL_USE: "skill:use",
  SKILL_COOLDOWN: "skill:cooldown",
  TUTORIAL_HINT: "tutorial:hint",
  TUTORIAL_DISMISS: "tutorial:dismiss",
  TUTORIAL_RESET: "tutorial:reset",
  STAT_ALLOCATE: "stat:allocate",
  SPRINT: "sprint",
} as const;

/** Custom WebSocket close codes (4xxx range) */
export const CloseCode = {
  KICKED_DUPLICATE: 4100,
  KICKED: 4101,
  VERSION_MISMATCH: 4102,
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

/** Client → Server: leader kicks a player from the party */
export interface PartyKickMessage {
  targetSessionId: string;
}

// ── Gate ──────────────────────────────────────────────────────────────────────

/** Client → Server: interact with a specific gate */
export interface GateInteractMessage {
  gateId: string;
}

// ── Chat ──────────────────────────────────────────────────────────────────────

/** Client → Server: toggle a skill on/off */
export interface SkillToggleMessage {
  skillId: SkillIdValue;
}

/** Client → Server: use an active skill */
export interface SkillUseMessage {
  skillId: SkillIdValue;
}

/** Server → Client: skill cooldown started (for UI overlay) */
export interface SkillCooldownMessage {
  skillId: SkillIdValue;
  /** Total cooldown duration in seconds */
  duration: number;
  /** Remaining cooldown in seconds */
  remaining: number;
}

// ── Tutorial ─────────────────────────────────────────────────────────────────

/** Server → Client: show a tutorial hint */
export interface TutorialHintMessage {
  step: TutorialStepValue;
  i18nKey: string;
}

/** Client → Server: player dismisses/completes a tutorial step */
export interface TutorialDismissMessage {
  step: TutorialStepValue;
}

// ── Stats ────────────────────────────────────────────────────────────────────

/** Client → Server: allocate a stat point to a base stat */
export interface StatAllocateMessage {
  stat: AllocatableStatValue;
}

// ── Sprint ───────────────────────────────────────────────────────────────────

/** Client → Server: toggle sprint on/off */
export interface SprintMessage {
  active: boolean;
}

// ── Misc ─────────────────────────────────────────────────────────────────────

/** Command info sent to client on join for help overlay */
export interface CommandInfo {
  name: string;
  usage: string;
  description: string;
  adminOnly: boolean;
}
