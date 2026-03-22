import { describe, it, expect } from "bun:test";
import { TileMap, TileType } from "../src/TileMap.js";

describe("TileMap get/set", () => {
  it("defaults all tiles to WALL", () => {
    const map = new TileMap(5, 5);
    expect(map.get(0, 0)).toBe(TileType.WALL);
    expect(map.get(4, 4)).toBe(TileType.WALL);
  });

  it("sets and gets in-bounds tiles", () => {
    const map = new TileMap(5, 5);
    map.set(2, 3, TileType.FLOOR);
    expect(map.get(2, 3)).toBe(TileType.FLOOR);
  });

  it("returns WALL for out-of-bounds positive coords", () => {
    const map = new TileMap(5, 5);
    expect(map.get(5, 5)).toBe(TileType.WALL);
    expect(map.get(100, 0)).toBe(TileType.WALL);
  });

  it("returns WALL for negative coords", () => {
    const map = new TileMap(5, 5);
    expect(map.get(-1, 0)).toBe(TileType.WALL);
    expect(map.get(0, -1)).toBe(TileType.WALL);
  });

  it("ignores set on out-of-bounds coords", () => {
    const map = new TileMap(5, 5);
    map.set(-1, 0, TileType.FLOOR);
    map.set(5, 0, TileType.FLOOR);
    expect(map.get(-1, 0)).toBe(TileType.WALL);
    expect(map.get(5, 0)).toBe(TileType.WALL);
  });
});

describe("TileMap isFloor", () => {
  it("FLOOR is walkable", () => {
    const map = new TileMap(3, 3);
    map.set(1, 1, TileType.FLOOR);
    expect(map.isFloor(1, 1)).toBe(true);
  });

  it("SPAWN is walkable", () => {
    const map = new TileMap(3, 3);
    map.set(1, 1, TileType.SPAWN);
    expect(map.isFloor(1, 1)).toBe(true);
  });

  it("EXIT is walkable", () => {
    const map = new TileMap(3, 3);
    map.set(1, 1, TileType.EXIT);
    expect(map.isFloor(1, 1)).toBe(true);
  });

  it("DOOR is walkable", () => {
    const map = new TileMap(3, 3);
    map.set(1, 1, TileType.DOOR);
    expect(map.isFloor(1, 1)).toBe(true);
  });

  it("WALL is not walkable", () => {
    const map = new TileMap(3, 3);
    expect(map.isFloor(1, 1)).toBe(false);
  });
});

describe("TileMap serialize/deserialize", () => {
  it("round-trips correctly", () => {
    const map = new TileMap(4, 3);
    map.set(0, 0, TileType.SPAWN);
    map.set(1, 1, TileType.FLOOR);
    map.set(2, 1, TileType.DOOR);
    map.set(3, 2, TileType.EXIT);

    const flat = map.serializeGrid();
    expect(flat.length).toBe(12);

    const restored = TileMap.fromSerialized(4, 3, flat);
    expect(restored.width).toBe(4);
    expect(restored.height).toBe(3);
    expect(restored.get(0, 0)).toBe(TileType.SPAWN);
    expect(restored.get(1, 1)).toBe(TileType.FLOOR);
    expect(restored.get(2, 1)).toBe(TileType.DOOR);
    expect(restored.get(3, 2)).toBe(TileType.EXIT);
    expect(restored.get(3, 0)).toBe(TileType.WALL);
  });

  it("throws on size mismatch", () => {
    expect(() => TileMap.fromSerialized(4, 3, [0, 1, 2])).toThrow();
  });
});
