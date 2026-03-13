import { TileMap } from "./TileMap";
import { TILE_SETS, TILE_SET_NAMES } from "./TileSets";
import type { TileSetName } from "./TileSets";
import { mulberry32 } from "./random";

/** Number of floor tile variants in a set */
export const FLOOR_VARIANT_COUNT = 8;

// ─── Pack / Unpack helpers ──────────────────────────────────────────

/** Encode setId + variant into a single number: (setId << 8) | variant */
export function packFloorTile(setId: number, variant: number): number {
  return (setId << 8) | variant;
}

/** Extract set ID from a packed floor value */
export function unpackSetId(packed: number): number {
  return packed >>> 8;
}

/** Extract variant (1-8) from a packed floor value */
export function unpackVariant(packed: number): number {
  return packed & 0xff;
}

// ─── Room-to-set assignment ─────────────────────────────────────────

export interface RoomSetAssignment {
  roomIndex: number;
  setName: TileSetName;
  setId: number;
}

/**
 * Assign a tile set to each room. Deterministic given the same seed.
 * Room 0 (spawn) always gets "set1". Others get a random set from the registry.
 */
export function assignRoomSets(roomCount: number, seed: number): RoomSetAssignment[] {
  const rand = mulberry32(seed);
  const assignments: RoomSetAssignment[] = [];

  for (let i = 0; i < roomCount; i++) {
    let setName: TileSetName;
    if (i === 0) {
      setName = "set1";
    } else {
      const idx = Math.floor(rand() * TILE_SET_NAMES.length);
      setName = TILE_SET_NAMES[idx];
    }
    assignments.push({
      roomIndex: i,
      setName,
      setId: TILE_SETS[setName].id,
    });
  }

  return assignments;
}

// ─── Variant weights ────────────────────────────────────────────────

/**
 * Weights for each variant (index 0 = variant 1, etc.)
 * floor_1 (plain stone) is dominant for a natural castle look.
 */
const VARIANT_WEIGHTS: number[] = [
  40, // floor_1 — plain
  9, // floor_2
  8, // floor_3
  9, // floor_4
  8, // floor_5
  9, // floor_6
  9, // floor_7
  8, // floor_8
];

/** Cumulative weight sum for weighted random selection */
const WEIGHT_TOTAL = VARIANT_WEIGHTS.reduce((sum, w) => sum + w, 0);

/**
 * Pick a variant (1-8) using weighted random.
 */
function pickVariant(rand: () => number): number {
  const r = rand() * WEIGHT_TOTAL;
  let cumulative = 0;
  for (let i = 0; i < VARIANT_WEIGHTS.length; i++) {
    cumulative += VARIANT_WEIGHTS[i];
    if (r < cumulative) {
      return i + 1; // variants are 1-indexed
    }
  }
  return VARIANT_WEIGHTS.length; // fallback
}

// ─── Floor variant generation ───────────────────────────────────────

/**
 * Generate a flat array of packed floor values for each tile in the map.
 * 0 = non-floor tile (wall). Non-zero = packed (setId << 8 | variant).
 *
 * Each tile's set is determined by which room owns it (via roomOwnership grid).
 * The result is deterministic for a given seed.
 *
 * @param tileMap        The dungeon tile map
 * @param seed           Integer seed (e.g. Date.now() captured once on server)
 * @param roomOwnership  Grid of room indices per tile (-1 = unowned)
 * @param roomSets       Set assignment per room
 * @returns Flat row-major array of size width * height
 */
export function generateFloorVariants(
  tileMap: TileMap,
  seed: number,
  roomOwnership: number[][],
  roomSets: RoomSetAssignment[],
): number[] {
  const rand = mulberry32(seed);
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
      if (tileMap.isFloor(x, y)) {
        const roomIdx = roomOwnership[y][x];
        const setId = roomSetMap.get(roomIdx) ?? defaultSetId;
        const variant = pickVariant(rand);
        result[idx] = packFloorTile(setId, variant);
      } else {
        result[idx] = 0;
      }
    }
  }

  return result;
}
