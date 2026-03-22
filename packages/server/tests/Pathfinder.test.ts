import { describe, it, expect, beforeEach } from "bun:test";
import { Pathfinder } from "../src/navigation/Pathfinder.js";
import type { WorldPos } from "../src/navigation/Pathfinder.js";
import { TileMap, TileType, TILE_SIZE } from "@dungeon/shared";

/**
 * Build a 10x10 TileMap with a known layout:
 *
 *   All floor except a vertical wall at column 5, rows 0-7
 *   (row 8-9 at column 5 are floor, leaving a gap at the bottom)
 *
 *   0123456789
 * 0 .....#....
 * 1 .....#....
 * 2 .....#....
 * 3 .....#....
 * 4 .....#....
 * 5 .....#....
 * 6 .....#....
 * 7 .....#....
 * 8 ..........
 * 9 ..........
 */
function buildTestMap(): TileMap {
  const map = new TileMap(10, 10);
  // Fill everything as floor
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      map.set(x, y, TileType.FLOOR);
    }
  }
  // Vertical wall at column 5, rows 0-7
  for (let y = 0; y <= 7; y++) {
    map.set(5, y, TileType.WALL);
  }
  return map;
}

/** Helper to convert tile coords to world coords */
function wp(tileX: number, tileZ: number): WorldPos {
  return { x: tileX * TILE_SIZE, z: tileZ * TILE_SIZE };
}

describe("Pathfinder", () => {
  let map: TileMap;
  let pf: Pathfinder;

  beforeEach(() => {
    map = buildTestMap();
    pf = new Pathfinder(map);
  });

  describe("isWalkable()", () => {
    it("returns true for a floor tile", () => {
      expect(pf.isWalkable(0, 0)).toBe(true);
    });

    it("returns false for a wall tile", () => {
      expect(pf.isWalkable(5, 0)).toBe(false);
    });

    it("returns false for out-of-bounds", () => {
      expect(pf.isWalkable(-1, 0)).toBe(false);
      expect(pf.isWalkable(10, 10)).toBe(false);
    });

    it("returns false for a blocked tile", () => {
      pf.blockTile(2, 2);
      expect(pf.isWalkable(2, 2)).toBe(false);
    });

    it("returns true after unblocking a tile", () => {
      pf.blockTile(2, 2);
      pf.unblockTile(2, 2);
      expect(pf.isWalkable(2, 2)).toBe(true);
    });
  });

  describe("hasLineOfSight()", () => {
    it("returns true for a clear horizontal line", () => {
      expect(pf.hasLineOfSight(wp(0, 0), wp(4, 0))).toBe(true);
    });

    it("returns false when a wall blocks the line", () => {
      // From left side to right side, wall at column 5
      expect(pf.hasLineOfSight(wp(3, 3), wp(7, 3))).toBe(false);
    });

    it("returns true for same point", () => {
      expect(pf.hasLineOfSight(wp(2, 2), wp(2, 2))).toBe(true);
    });
  });

  describe("findPath()", () => {
    it("returns direct path when line of sight is clear", () => {
      const path = pf.findPath(wp(0, 0), wp(4, 0));
      expect(path.length).toBeGreaterThan(0);
      // With LoS the path is just the destination
      const last = path[path.length - 1];
      expect(last.x).toBeCloseTo(4 * TILE_SIZE, 1);
      expect(last.z).toBeCloseTo(0 * TILE_SIZE, 1);
    });

    it("finds a path around the wall obstacle", () => {
      // From (2,2) to (7,2) — wall at column 5 blocks direct path
      // Must go through the gap at rows 8-9
      const path = pf.findPath(wp(2, 2), wp(7, 2));
      expect(path.length).toBeGreaterThan(0);
      const last = path[path.length - 1];
      expect(last.x).toBeCloseTo(7 * TILE_SIZE, 1);
      expect(last.z).toBeCloseTo(2 * TILE_SIZE, 1);
    });

    it("returns empty array when destination is a wall", () => {
      const path = pf.findPath(wp(0, 0), wp(5, 3));
      expect(path).toEqual([]);
    });

    it("returns empty array when destination is unreachable", () => {
      // Block the gap so the right side is fully unreachable
      map.set(5, 8, TileType.WALL);
      map.set(5, 9, TileType.WALL);
      const path = pf.findPath(wp(0, 0), wp(7, 0));
      expect(path).toEqual([]);
    });
  });
});
