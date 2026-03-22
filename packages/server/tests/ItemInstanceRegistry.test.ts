import { describe, it, expect, beforeEach } from "bun:test";
import {
  getInstance,
  registerInstance,
  createInstanceInMemory,
  cacheInstances,
  evictInstances,
} from "../src/items/ItemInstanceRegistry.js";
import type { ItemInstance } from "@dungeon/shared";

/**
 * The registry uses global Maps. We clean up after each test by evicting
 * all IDs we created during that test.
 */
let trackedIds: string[] = [];

beforeEach(() => {
  // Evict anything left over from the previous test
  if (trackedIds.length > 0) {
    evictInstances(trackedIds);
    trackedIds = [];
  }
});

describe("ItemInstanceRegistry", () => {
  describe("registerInstance + getInstance", () => {
    it("returns the registered instance by id", () => {
      const inst: ItemInstance = {
        id: "test-reg-1",
        itemId: "sword",
        rolledStats: { attackDamage: 10 },
        itemLevel: 5,
      };
      trackedIds.push(inst.id);
      registerInstance(inst);
      expect(getInstance(inst.id)).toBe(inst);
    });

    it("returns undefined for an unregistered id", () => {
      expect(getInstance("nonexistent-id")).toBeUndefined();
    });
  });

  describe("createInstanceInMemory", () => {
    it("creates an instance with a UUID and caches it", () => {
      const inst = createInstanceInMemory("potion", { strength: 3 }, 7);
      trackedIds.push(inst.id);

      expect(inst.itemId).toBe("potion");
      expect(inst.rolledStats).toEqual({ strength: 3 });
      expect(inst.itemLevel).toBe(7);
      // Should be a valid UUID (36 chars with hyphens)
      expect(inst.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      // Should be retrievable from cache
      expect(getInstance(inst.id)).toBe(inst);
    });

    it("generates unique IDs for each call", () => {
      const a = createInstanceInMemory("item_a", {}, 1);
      const b = createInstanceInMemory("item_b", {}, 1);
      trackedIds.push(a.id, b.id);
      expect(a.id).not.toBe(b.id);
    });
  });

  describe("cacheInstances", () => {
    it("bulk loads multiple instances into cache", () => {
      const instances: ItemInstance[] = [
        { id: "bulk-1", itemId: "helm", rolledStats: { defense: 5 }, itemLevel: 3 },
        { id: "bulk-2", itemId: "boots", rolledStats: { agility: 2 }, itemLevel: 4 },
      ];
      trackedIds.push("bulk-1", "bulk-2");
      cacheInstances(instances);

      expect(getInstance("bulk-1")).toBe(instances[0]);
      expect(getInstance("bulk-2")).toBe(instances[1]);
    });
  });

  describe("evictInstances", () => {
    it("removes instances from cache", () => {
      const inst: ItemInstance = {
        id: "evict-1",
        itemId: "shield",
        rolledStats: { defense: 8 },
        itemLevel: 10,
      };
      registerInstance(inst);
      expect(getInstance("evict-1")).toBe(inst);

      evictInstances(["evict-1"]);
      expect(getInstance("evict-1")).toBeUndefined();
      // Already evicted, no need to track
    });

    it("handles evicting non-existent IDs gracefully", () => {
      // Should not throw
      evictInstances(["does-not-exist-1", "does-not-exist-2"]);
    });
  });
});
