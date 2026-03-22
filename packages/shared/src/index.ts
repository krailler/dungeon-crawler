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
  ItemDestroyMessage,
  ItemSplitMessage,
  ItemCooldownMessage,
  ItemDefsRequestMessage,
  ItemDefsResponseMessage,
  SkillDefsRequestMessage,
  SkillDefsResponseMessage,
  ActionFeedbackMessage,
  LootTakeMessage,
  SetTargetMessage,
  ReviveStartMessage,
  EffectDefsRequestMessage,
  EffectDefsResponseMessage,
  ClassDefsRequestMessage,
  ClassDefsResponseMessage,
  TalentAllocateMessage,
  TalentAllocatedMessage,
  TalentDefsRequestMessage,
  TalentDefsResponseMessage,
  TalentStateMessage,
  ConsumableBarAssignMessage,
  ConsumableBarUnassignMessage,
  ConsumableBarSwapMessage,
  EquipItemMessage,
  UnequipItemMessage,
  InstanceDefsRequestMessage,
  InstanceDefsResponseMessage,
  DungeonSummaryMessage,
  DungeonSummaryQuest,
  DungeonSummaryItem,
  DungeonSummaryPlayer,
} from "./protocol.js";

export {
  generateFloorVariants,
  assignRoomSets,
  packTileVariant,
  unpackSetId,
  unpackVariant,
  FLOOR_VARIANT_COUNT,
} from "./FloorVariants.js";
export type { RoomSetAssignment } from "./FloorVariants.js";

export { TILE_SETS, TILE_SET_NAMES, tileSetNameFromId } from "./TileSets.js";
export type { TileSetName } from "./TileSets.js";

export { generateWallVariants, WALL_VARIANT_COUNT } from "./WallVariants.js";

export { mulberry32, selectByWeight } from "./random.js";

export { distSq, angleBetween, isFromBehind } from "./math.js";

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

export { computeGoldDrop, computeLevelModifier } from "./Economy.js";

export { xpToNextLevel, computeXpDrop } from "./Leveling.js";

export { MAX_SKILL_SLOTS } from "./Skills.js";
export type { SkillDef } from "./Skills.js";

export { Role } from "./Roles.js";
export type { RoleValue } from "./Roles.js";

export { GateType } from "./GateTypes.js";
export type { GateTypeValue } from "./GateTypes.js";

export {
  QuestType,
  QuestStatus,
  BOSS_TIMER_BASE,
  BOSS_TIMER_PER_LEVEL,
  QUEST_BONUS_GOLD_PER_LEVEL,
  QUEST_BONUS_XP_PER_LEVEL,
} from "./Quests.js";
export type { QuestTypeValue, QuestStatusValue } from "./Quests.js";

export { TutorialStep } from "./Tutorial.js";
export type { TutorialStepValue } from "./Tutorial.js";

export { toClassDefClient } from "./Classes.js";
export type { ClassDef, ClassDefClient, ClassSkillEntry } from "./Classes.js";

export { ItemEffectType, ItemRarity, toItemDefClient } from "./Items.js";
export type {
  ItemEffectTypeValue,
  ItemRarityValue,
  ItemDef,
  ItemDefClient,
  BonusPoolEntry,
  StatRange,
  ItemInstance,
  ItemInstanceClient,
} from "./Items.js";

// EQUIPMENT_SLOTS, BONUS_AFFIXES_BY_RARITY, INTEGER_STATS, EquipmentSlotValue
// already re-exported via export * from "./constants/index.js"

export { TalentEffectType, toTalentDefClient, computeTalentSkillMods } from "./Talents.js";
export type {
  TalentEffectTypeValue,
  TalentStatModifier,
  TalentSkillModifier,
  TalentRankEffect,
  TalentDef,
  TalentDefClient,
} from "./Talents.js";

export {
  CreatureEffectTrigger,
  StackBehavior,
  StatModType,
  lerpEffectValue,
  computeScalingFactor,
  toEffectDefClient,
} from "./Effects.js";
export type {
  CreatureEffectTriggerValue,
  StackBehaviorValue,
  StatModTypeValue,
  StatModifier,
  TickEffect,
  EffectScaling,
  EffectDef,
  EffectDefClient,
} from "./Effects.js";
