export { TileMap, TileType } from "./TileMap.js";
export type { TileType as TileTypeValue } from "./TileMap.js";

export * from "./constants/index.js";

export { MessageType, CloseCode, ChatCategory, ChatVariant } from "./protocol.js";
export type {
  MoveMessage,
  AdminRestartMessage,
  CombatLogMessage,
  PromoteLeaderMessage,
  PartyKickMessage,
  ChatSendPayload,
  ChatEntry,
  ChatCategoryValue,
  ChatVariantValue,
  CommandInfo,
  DebugPathEntry,
  DebugPathsMessage,
  GateInteractMessage,
  SkillToggleMessage,
  SkillUseMessage,
  SkillCooldownMessage,
  TutorialHintMessage,
  TutorialDismissMessage,
  StatAllocateMessage,
  SprintMessage,
  AdminDebugInfoMessage,
  DamageDealtMessage,
  ItemUseMessage,
  ItemSwapMessage,
  ItemCooldownMessage,
  ItemDefsRequestMessage,
  ItemDefsResponseMessage,
  SkillDefsRequestMessage,
  SkillDefsResponseMessage,
  ActionFeedbackMessage,
  LootTakeMessage,
  SetTargetMessage,
  ReviveStartMessage,
} from "./protocol.js";

export {
  generateFloorVariants,
  assignRoomSets,
  packFloorTile,
  unpackSetId,
  unpackVariant,
  FLOOR_VARIANT_COUNT,
} from "./FloorVariants.js";
export type { RoomSetAssignment } from "./FloorVariants.js";

export { TILE_SETS, TILE_SET_NAMES, tileSetNameFromId } from "./TileSets.js";
export type { TileSetName } from "./TileSets.js";

export { generateWallVariants, WALL_VARIANT_COUNT } from "./WallVariants.js";

export { mulberry32 } from "./random.js";

export { generateRoomName } from "./RoomNames.js";

export {
  AllocatableStat,
  ALLOCATABLE_STATS,
  computeDerivedStats,
  computeDamage,
  PLAYER_SCALING,
  DEFAULT_PLAYER_STATS,
} from "./Stats.js";
export type { AllocatableStatValue, BaseStats, DerivedStats, StatScaling } from "./Stats.js";

export { computeCreatureDerivedStats, scaleCreatureDerivedStats } from "./CreatureTypes.js";
export type { CreatureTypeDefinition, CreatureLootEntry } from "./CreatureTypes.js";

export { computeGoldDrop } from "./Economy.js";

export { xpToNextLevel, computeXpDrop } from "./Leveling.js";

export { MAX_SKILL_SLOTS, DEFAULT_SKILL_IDS } from "./Skills.js";
export type { SkillDef } from "./Skills.js";

export { Role } from "./Roles.js";
export type { RoleValue } from "./Roles.js";

export { GateType } from "./GateTypes.js";
export type { GateTypeValue } from "./GateTypes.js";

export { TutorialStep } from "./Tutorial.js";
export type { TutorialStepValue } from "./Tutorial.js";

export type { ItemDef } from "./Items.js";
