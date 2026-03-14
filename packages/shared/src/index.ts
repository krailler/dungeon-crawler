export { TileMap, TileType } from "./TileMap.js";
export type { TileType as TileTypeValue } from "./TileMap.js";

export {
  TILE_SIZE,
  DUNGEON_WIDTH,
  DUNGEON_HEIGHT,
  DUNGEON_ROOMS,
  PLAYER_SPEED,
  PLAYER_HEALTH,
  PLAYER_ATTACK_DAMAGE,
  PLAYER_ATTACK_RANGE,
  PLAYER_ATTACK_COOLDOWN,
  ATTACK_ANIM_DURATION,
  ENEMY_SPEED,
  ENEMY_HEALTH,
  ENEMY_DETECTION_RANGE,
  ENEMY_ATTACK_RANGE,
  ENEMY_ATTACK_COOLDOWN,
  ENEMY_ATTACK_DAMAGE,
  ENEMY_REPATH_INTERVAL,
  CAMERA_ALPHA,
  CAMERA_BETA,
  CAMERA_RADIUS,
  CAMERA_RADIUS_MIN,
  CAMERA_RADIUS_MAX,
  CAMERA_FOLLOW_SPEED,
  WALL_HEIGHT,
  WALL_DEPTH,
  AMBIENT_INTENSITY,
  TORCH_INTENSITY,
  TORCH_RANGE,
  TORCH_ANGLE,
  WALL_TORCH_INTENSITY,
  WALL_TORCH_RANGE,
  WALL_TORCH_CHANCE,
  FOG_INNER_RADIUS,
  FOG_OUTER_RADIUS,
  MINIMAP_DISCOVERY_RADIUS,
} from "./Constants.js";

export { MessageType, CloseCode } from "./protocol.js";
export type { MoveMessage, AdminRestartMessage, CombatLogMessage } from "./protocol.js";

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

export {
  computeDerivedStats,
  computeDamage,
  PLAYER_SCALING,
  DEFAULT_PLAYER_STATS,
} from "./Stats.js";
export type { BaseStats, DerivedStats, StatScaling } from "./Stats.js";

export { EnemyTypeId, ENEMY_TYPES, computeEnemyDerivedStats } from "./EnemyTypes.js";
export type { EnemyTypeIdValue, EnemyTypeDefinition } from "./EnemyTypes.js";
