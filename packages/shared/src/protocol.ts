import type { AllocatableStatValue } from "./Stats.js";
import type { TutorialStepValue } from "./Tutorial.js";
import type { ItemDefClient } from "./Items.js";
import type { SkillDef } from "./Skills.js";
import type { EffectDefClient } from "./Effects.js";
import type { ClassDefClient } from "./Classes.js";
import type { TalentDefClient } from "./Talents.js";

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
  ADMIN_DEBUG_INFO: "admin:debug_info",
  DAMAGE_DEALT: "combat:damage",
  ITEM_USE: "item:use",
  ITEM_SWAP: "item:swap",
  ITEM_COOLDOWN: "item:cooldown",
  ACTION_FEEDBACK: "action:feedback",
  ITEM_DEFS_REQUEST: "item:defs:req",
  ITEM_DEFS_RESPONSE: "item:defs:res",
  SKILL_DEFS_REQUEST: "skill:defs:req",
  SKILL_DEFS_RESPONSE: "skill:defs:res",
  LOOT_TAKE: "loot:take",
  SET_TARGET: "target:set",
  TOGGLE_AOI: "debug:aoi",
  REVIVE_START: "revive:start",
  EFFECT_DEFS_REQUEST: "effect:defs:req",
  EFFECT_DEFS_RESPONSE: "effect:defs:res",
  EXIT_INTERACT: "exit:interact",
  CLASS_DEFS_REQUEST: "class:defs:req",
  CLASS_DEFS_RESPONSE: "class:defs:res",
  TALENT_ALLOCATE: "talent:allocate",
  TALENT_ALLOCATED: "talent:allocated",
  TALENT_RESET: "talent:reset",
  TALENT_DEFS_REQUEST: "talent:defs:req",
  TALENT_DEFS_RESPONSE: "talent:defs:res",
  TALENT_STATE: "talent:state",
} as const;

/** Custom WebSocket close codes (4xxx range) */
export const CloseCode = {
  KICKED_DUPLICATE: 4100,
  KICKED: 4101,
  VERSION_MISMATCH: 4102,
  DUNGEON_COMPLETED: 4103,
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
  /** "player" or "creature" */
  kind: "player" | "creature";
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

// ── Skills ────────────────────────────────────────────────────────────────────

/** Client → Server: toggle a skill on/off */
export interface SkillToggleMessage {
  skillId: string;
}

/** Client → Server: use an active skill */
export interface SkillUseMessage {
  skillId: string;
}

/** Server → Client: skill cooldown started (for UI overlay) */
export interface SkillCooldownMessage {
  skillId: string;
  /** Total cooldown duration in seconds */
  duration: number;
  /** Remaining cooldown in seconds */
  remaining: number;
}

/** Client → Server: request skill definitions by id */
export interface SkillDefsRequestMessage {
  skillIds: string[];
}

/** Server → Client: skill definitions response */
export interface SkillDefsResponseMessage {
  /** Cache version — changes when skill definitions are modified */
  version: number;
  skills: SkillDef[];
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

/** Server → Client: damage dealt by this player to a creature (for floating combat text) */
export interface DamageDealtMessage {
  /** Creature ID that was hit */
  creatureId: string;
  /** Final damage applied */
  dmg: number;
  /** Whether this hit killed the creature */
  kill: boolean;
}

export interface AdminDebugInfoMessage {
  seed: number;
  tickRate: number;
  tickRateTarget: number;
  runtime: string;
}

// ── Items ────────────────────────────────────────────────────────────────────

/** Client → Server: use a consumable item */
export interface ItemUseMessage {
  itemId: string;
}

/** Client → Server: swap (or move) two inventory slots */
export interface ItemSwapMessage {
  /** Source slot index */
  from: number;
  /** Destination slot index */
  to: number;
}

/** Server → Client: item used successfully (cooldown + optional sound) */
export interface ItemCooldownMessage {
  itemId: string;
  /** Total cooldown duration in seconds (0 = no cooldown) */
  duration: number;
  /** Sound to play on the client (empty = none) */
  useSound?: string;
}

/** Client → Server: request item definitions by id */
export interface ItemDefsRequestMessage {
  itemIds: string[];
}

/** Server → Client: item definitions response */
export interface ItemDefsResponseMessage {
  /** Cache version — changes when item definitions are modified */
  version: number;
  items: ItemDefClient[];
}

// ── Loot ────────────────────────────────────────────────────────────────────

/** Client → Server: take an item from a loot bag */
export interface LootTakeMessage {
  lootBagId: string;
  /** Index of the item in the bag's items array */
  itemIndex: number;
  /** Item ID — used to verify the client and server agree on which item is at this index */
  itemId: string;
}

// ── Action feedback ─────────────────────────────────────────────────────────

/** Server → Client: action failed with i18n reason */
export interface ActionFeedbackMessage {
  /** i18n translation key for the feedback text */
  i18nKey: string;
}

// ── Targeting ───────────────────────────────────────────────────────────────

/** Client → Server: set or clear the player's attack target */
export interface SetTargetMessage {
  /** Entity ID to target, or null to clear */
  targetId: string | null;
  /** Type of target: "creature" or "player". Defaults to "creature" for backward compat. */
  targetType?: "creature" | "player";
}

// ── Revive ──────────────────────────────────────────────────────────────────

/** Client → Server: start channelling revive on a downed teammate */
export interface ReviveStartMessage {
  /** Session ID of the downed player to revive */
  targetSessionId: string;
}

// ── Misc ─────────────────────────────────────────────────────────────────────

// ── Effects ─────────────────────────────────────────────────────────────────

/** Client → Server: request effect definitions by id */
export interface EffectDefsRequestMessage {
  effectIds: string[];
}

/** Server → Client: effect definitions response */
export interface EffectDefsResponseMessage {
  /** Cache version — changes when effect definitions are modified */
  version: number;
  effects: EffectDefClient[];
}

// ── Classes ─────────────────────────────────────────────────────────────────

/** Client → Server: request class definitions by id */
export interface ClassDefsRequestMessage {
  classIds: string[];
}

/** Server → Client: class definitions response */
export interface ClassDefsResponseMessage {
  /** Cache version — changes when class definitions are modified */
  version: number;
  classes: ClassDefClient[];
}

// ── Misc ─────────────────────────────────────────────────────────────────────

// ── Talents ──────────────────────────────────────────────────────────────────

/** Client → Server: allocate a talent point */
export interface TalentAllocateMessage {
  talentId: string;
}

/** Server → Client: talent allocation confirmed */
export interface TalentAllocatedMessage {
  talentId: string;
  newRank: number;
}

/** Client → Server: request talent definitions by id */
export interface TalentDefsRequestMessage {
  talentIds: string[];
}

/** Server → Client: talent definitions response */
export interface TalentDefsResponseMessage {
  version: number;
  talents: TalentDefClient[];
}

/** Server → Client: full talent allocation state (sent on join) */
export interface TalentStateMessage {
  allocations: { talentId: string; rank: number }[];
  /** All talent IDs available for the player's class (for client to fetch defs) */
  classTalentIds: string[];
}

// ── Misc ─────────────────────────────────────────────────────────────────────

/** Command info sent to client on join for help overlay */
export interface CommandInfo {
  name: string;
  usage: string;
  description: string;
  adminOnly: boolean;
}
