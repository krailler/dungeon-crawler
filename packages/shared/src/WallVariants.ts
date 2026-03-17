import { TileMap, TileType } from "./TileMap.js";
import { TILE_SETS } from "./TileSets.js";
import { packFloorTile } from "./FloorVariants.js";
import type { RoomSetAssignment } from "./FloorVariants.js";
import { mulberry32 } from "./random.js";

/** Number of wall decoration variants in a set */
export const WALL_VARIANT_COUNT = 3;

// ─── Variant weights ────────────────────────────────────────────────

/**
 * Weights for each wall variant (index 0 = variant 1, etc.)
 * wall_3 (window bars) is rare for a natural look.
 */
const WALL_VARIANT_WEIGHTS: number[] = [
  40, // wall_1 — standard stone
  45, // wall_2 — stone variant
  15, // wall_3 — window with bars (rare)
];

const WALL_WEIGHT_TOTAL = WALL_VARIANT_WEIGHTS.reduce((sum, w) => sum + w, 0);

/**
 * Pick a wall variant (1-3) using weighted random.
 */
function pickWallVariant(rand: () => number): number {
  const r = rand() * WALL_WEIGHT_TOTAL;
  let cumulative = 0;
  for (let i = 0; i < WALL_VARIANT_WEIGHTS.length; i++) {
    cumulative += WALL_VARIANT_WEIGHTS[i];
    if (r < cumulative) {
      return i + 1; // variants are 1-indexed
    }
  }
  return WALL_VARIANT_WEIGHTS.length; // fallback
}

// ─── Wall variant generation ─────────────────────────────────────────

/**
 * Find the room index of the first adjacent floor tile.
 * Used to determine which set a wall tile should use.
 */
function findAdjacentRoom(
  tileMap: TileMap,
  x: number,
  y: number,
  roomOwnership: number[][],
): number {
  const dirs = [
    [0, -1],
    [0, 1],
    [-1, 0],
    [1, 0],
  ];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (tileMap.isFloor(nx, ny) && roomOwnership[ny]?.[nx] >= 0) {
      return roomOwnership[ny][nx];
    }
  }
  return 0; // fallback to first room
}

/**
 * Generate a flat array of packed wall values for each tile in the map.
 * 0 = non-wall or interior wall tile. Non-zero = packed (setId << 8 | variant).
 *
 * Only wall tiles adjacent to floor get a variant. The wall's set is inherited
 * from the room of its adjacent floor tile.
 *
 * Uses XOR offset on seed to produce independent sequence from floor variants.
 *
 * @param tileMap        The dungeon tile map
 * @param seed           Integer seed (same as floor generation)
 * @param roomOwnership  Grid of room indices per tile (-1 = unowned)
 * @param roomSets       Set assignment per room (shared with floors)
 * @returns Flat row-major array of size width * height
 */
export function generateWallVariants(
  tileMap: TileMap,
  seed: number,
  roomOwnership: number[][],
  roomSets: RoomSetAssignment[],
): number[] {
  // XOR offset for independence from floor variant sequence
  const rand = mulberry32(seed ^ 0x57414c4c);
  const result: number[] = new Array(tileMap.width * tileMap.height);

  // Quick lookup: roomIndex → setId
  const roomSetMap = new Map<number, number>();
  for (const assignment of roomSets) {
    roomSetMap.set(assignment.roomIndex, assignment.setId);
  }
  const defaultSetId = TILE_SETS.set1.id;

  for (let y = 0; y < tileMap.height; y++) {
    for (let x = 0; x < tileMap.width; x++) {
      const idx = y * tileMap.width + x;
      if (tileMap.get(x, y) === TileType.WALL && tileMap.isAdjacentToFloor(x, y)) {
        const adjacentRoom = findAdjacentRoom(tileMap, x, y, roomOwnership);
        const setId = roomSetMap.get(adjacentRoom) ?? defaultSetId;
        const variant = pickWallVariant(rand);
        result[idx] = packFloorTile(setId, variant);
      } else {
        result[idx] = 0;
      }
    }
  }

  return result;
}
