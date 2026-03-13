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
} from "./Constants.js";

export { MessageType } from "./protocol.js";
export type { MoveMessage } from "./protocol.js";

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
