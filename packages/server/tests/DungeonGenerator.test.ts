import { describe, it, expect, beforeEach } from "bun:test";
import { DungeonGenerator } from "../src/dungeon/DungeonGenerator.js";
import { TileType } from "@dungeon/shared";

describe("DungeonGenerator", () => {
  let gen: DungeonGenerator;

  beforeEach(() => {
    gen = new DungeonGenerator();
  });

  describe("determinism", () => {
    it("produces identical maps with the same seed", () => {
      const a = new DungeonGenerator();
      const b = new DungeonGenerator();

      const mapA = a.generate(50, 50, 6, 12345);
      const mapB = b.generate(50, 50, 6, 12345);

      expect(mapA.serializeGrid()).toEqual(mapB.serializeGrid());
    });

    it("produces different maps with different seeds", () => {
      const a = new DungeonGenerator();
      const b = new DungeonGenerator();

      const mapA = a.generate(50, 50, 6, 11111);
      const mapB = b.generate(50, 50, 6, 99999);

      expect(mapA.serializeGrid()).not.toEqual(mapB.serializeGrid());
    });
  });

  describe("special tiles", () => {
    it("places a SPAWN tile", () => {
      const map = gen.generate(50, 50, 5, 42);
      const flat = map.serializeGrid();
      expect(flat).toContain(TileType.SPAWN);
    });

    it("places an EXIT tile when there are at least 2 rooms", () => {
      const map = gen.generate(50, 50, 5, 42);
      const flat = map.serializeGrid();
      expect(flat).toContain(TileType.EXIT);
    });

    it("has exactly one SPAWN and one EXIT", () => {
      const map = gen.generate(50, 50, 6, 777);
      const flat = map.serializeGrid();
      const spawnCount = flat.filter((t) => t === TileType.SPAWN).length;
      const exitCount = flat.filter((t) => t === TileType.EXIT).length;
      expect(spawnCount).toBe(1);
      expect(exitCount).toBe(1);
    });
  });

  describe("room placement", () => {
    it("does not exceed the requested room count", () => {
      gen.generate(50, 50, 8, 42);
      const rooms = gen.getRooms();
      expect(rooms.length).toBeLessThanOrEqual(8);
      expect(rooms.length).toBeGreaterThan(0);
    });

    it("rooms do not overlap (including 1-tile padding)", () => {
      gen.generate(60, 60, 10, 42);
      const rooms = gen.getRooms();

      for (let i = 0; i < rooms.length; i++) {
        for (let j = i + 1; j < rooms.length; j++) {
          const a = rooms[i];
          const b = rooms[j];
          // With 1-tile padding, rooms must not be adjacent
          const overlapX = a.x - 1 < b.x + b.w && a.x + a.w + 1 > b.x;
          const overlapY = a.y - 1 < b.y + b.h && a.y + a.h + 1 > b.y;
          expect(overlapX && overlapY).toBe(false);
        }
      }
    });
  });

  describe("connectivity", () => {
    it("generates floor tiles connecting rooms (corridors exist)", () => {
      const map = gen.generate(50, 50, 5, 42);
      let floorCount = 0;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          if (map.isFloor(x, y)) floorCount++;
        }
      }
      // Rooms alone (min 4x4=16 tiles each, 5 rooms = 80+) plus corridors
      expect(floorCount).toBeGreaterThan(80);
    });
  });

  describe("gate positions", () => {
    it("finds gate positions around the spawn room", () => {
      gen.generate(50, 50, 5, 42);
      const gates = gen.getGatePositions();
      // With multiple rooms connected, there should be at least one gate
      expect(gates.length).toBeGreaterThan(0);
    });

    it("gate positions are floor tiles", () => {
      const map = gen.generate(50, 50, 5, 42);
      const gates = gen.getGatePositions();
      for (const gate of gates) {
        expect(map.isFloor(gate.x, gate.y)).toBe(true);
      }
    });
  });
});
