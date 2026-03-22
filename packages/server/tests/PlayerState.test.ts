import { describe, it, expect, beforeEach } from "bun:test";
import { PlayerState } from "../src/state/PlayerState.js";
import { InventorySlotState } from "../src/state/InventorySlotState.js";
import { EquipmentSlotState } from "../src/state/EquipmentSlotState.js";
import {
  xpToNextLevel,
  MAX_LEVEL,
  TALENT_UNLOCK_LEVEL,
  INVENTORY_MAX_SLOTS,
} from "@dungeon/shared";

describe("PlayerState", () => {
  let player: PlayerState;

  beforeEach(() => {
    player = new PlayerState();
    // PlayerState starts at level 1 with base stats 10/10/10
    // xpToNext is 0 by default in Schema — set it to match level 1
    player.xpToNext = xpToNextLevel(1);
  });

  // ── addXp ──────────────────────────────────────────────────────────────────

  describe("addXp()", () => {
    it("adds XP without leveling up", () => {
      const needed = xpToNextLevel(1); // floor(50 * 1^2) = 50
      player.addXp(needed - 1);
      expect(player.xp).toBe(needed - 1);
      expect(player.level).toBe(1);
    });

    it("triggers a single level-up when XP reaches the threshold", () => {
      const needed = xpToNextLevel(1); // 50
      const result = player.addXp(needed);
      expect(result).toEqual([2]);
      expect(player.level).toBe(2);
      expect(player.xp).toBe(0);
      expect(player.xpToNext).toBe(xpToNextLevel(2));
    });

    it("carries over excess XP after level-up", () => {
      const needed = xpToNextLevel(1); // 50
      const excess = 10;
      const result = player.addXp(needed + excess);
      expect(result).toEqual([2]);
      expect(player.level).toBe(2);
      expect(player.xp).toBe(excess);
    });

    it("handles multi-level-up in a single call", () => {
      // Level 1 needs 50 XP, level 2 needs 200 XP = total 250 to reach level 3
      const neededFor1 = xpToNextLevel(1); // 50
      const neededFor2 = xpToNextLevel(2); // floor(50 * 4) = 200
      const result = player.addXp(neededFor1 + neededFor2);
      expect(result).toEqual([2, 3]);
      expect(player.level).toBe(3);
      expect(player.xp).toBe(0);
    });

    it("returns empty array when already at MAX_LEVEL", () => {
      player.level = MAX_LEVEL;
      const result = player.addXp(9999);
      expect(result).toEqual([]);
      expect(player.level).toBe(MAX_LEVEL);
    });

    it("caps at MAX_LEVEL during multi-level-up", () => {
      player.level = MAX_LEVEL - 1;
      player.xpToNext = xpToNextLevel(MAX_LEVEL - 1);
      const result = player.addXp(999999);
      expect(result).toEqual([MAX_LEVEL]);
      expect(player.level).toBe(MAX_LEVEL);
    });
  });

  // ── levelUp ────────────────────────────────────────────────────────────────

  describe("levelUp()", () => {
    it("increments level and grants a stat point", () => {
      player.levelUp();
      expect(player.level).toBe(2);
      expect(player.statPoints).toBe(1);
    });

    it("grants a talent point at TALENT_UNLOCK_LEVEL", () => {
      player.level = TALENT_UNLOCK_LEVEL - 1;
      player.levelUp();
      expect(player.level).toBe(TALENT_UNLOCK_LEVEL);
      expect(player.talentPoints).toBe(1);
    });

    it("does NOT grant a talent point below TALENT_UNLOCK_LEVEL", () => {
      // Level 1 → 2 (below unlock level 5)
      player.levelUp();
      expect(player.talentPoints).toBe(0);
    });

    it("updates xpToNext for the new level", () => {
      player.levelUp();
      expect(player.xpToNext).toBe(xpToNextLevel(2));
    });
  });

  // ── allocateStat ───────────────────────────────────────────────────────────

  describe("allocateStat()", () => {
    it("allocates strength when stat points available", () => {
      player.statPoints = 3;
      const result = player.allocateStat("strength");
      expect(result).toBe(true);
      expect(player.strength).toBe(11);
      expect(player.statPoints).toBe(2);
    });

    it("allocates vitality", () => {
      player.statPoints = 1;
      expect(player.allocateStat("vitality")).toBe(true);
      expect(player.vitality).toBe(11);
      expect(player.statPoints).toBe(0);
    });

    it("allocates agility", () => {
      player.statPoints = 1;
      expect(player.allocateStat("agility")).toBe(true);
      expect(player.agility).toBe(11);
      expect(player.statPoints).toBe(0);
    });

    it("returns false when no stat points", () => {
      player.statPoints = 0;
      const result = player.allocateStat("strength");
      expect(result).toBe(false);
      expect(player.strength).toBe(10);
    });
  });

  // ── resetStats ─────────────────────────────────────────────────────────────

  describe("resetStats()", () => {
    it("resets stats to 10/10/10 and refunds points", () => {
      // Simulate level 5 player who allocated 4 points
      player.level = 5;
      player.strength = 12;
      player.vitality = 11;
      player.agility = 11;
      player.statPoints = 0;

      const spent = player.resetStats();
      expect(spent).toBe(4);
      expect(player.strength).toBe(10);
      expect(player.vitality).toBe(10);
      expect(player.agility).toBe(10);
      // statPoints = level - 1 = 4
      expect(player.statPoints).toBe(4);
    });

    it("returns 0 when no stats were allocated", () => {
      player.level = 3;
      const spent = player.resetStats();
      expect(spent).toBe(0);
      expect(player.statPoints).toBe(2); // level - 1
    });
  });

  // ── addItem ────────────────────────────────────────────────────────────────

  describe("addItem()", () => {
    it("adds item to an empty inventory", () => {
      const added = player.addItem("potion", 3, 5);
      expect(added).toBe(3);
      const slot = player.inventory.get("0");
      expect(slot).toBeDefined();
      expect(slot!.itemId).toBe("potion");
      expect(slot!.quantity).toBe(3);
    });

    it("stacks onto an existing slot with the same item", () => {
      player.addItem("potion", 2, 5);
      const added = player.addItem("potion", 2, 5);
      expect(added).toBe(2);
      const slot = player.inventory.get("0");
      expect(slot!.quantity).toBe(4);
    });

    it("respects maxStack when stacking", () => {
      player.addItem("potion", 4, 5);
      // Only 1 more can fit in existing stack
      const added = player.addItem("potion", 3, 5);
      // 1 fits in existing stack, 2 go to new slot
      expect(added).toBe(3);
      expect(player.inventory.get("0")!.quantity).toBe(5);
      expect(player.inventory.get("1")!.quantity).toBe(2);
    });

    it("returns 0 when inventory is completely full", () => {
      // Fill all 12 slots
      for (let i = 0; i < INVENTORY_MAX_SLOTS; i++) {
        player.addItem(`item_${i}`, 1, 1);
      }
      const added = player.addItem("extra", 1, 1);
      expect(added).toBe(0);
    });

    it("adds to partial capacity when some slots are full", () => {
      // Fill all but one slot
      for (let i = 0; i < INVENTORY_MAX_SLOTS - 1; i++) {
        player.addItem(`item_${i}`, 1, 1);
      }
      // One empty slot left, maxStack = 3
      const added = player.addItem("potion", 5, 3);
      expect(added).toBe(3); // only 3 fit in the single empty slot
    });
  });

  // ── removeItem ─────────────────────────────────────────────────────────────

  describe("removeItem()", () => {
    it("removes quantity from a slot", () => {
      player.addItem("potion", 5, 10);
      const removed = player.removeItem("potion", 2);
      expect(removed).toBe(2);
      expect(player.inventory.get("0")!.quantity).toBe(3);
    });

    it("deletes the slot when quantity reaches zero", () => {
      player.addItem("potion", 3, 10);
      player.removeItem("potion", 3);
      expect(player.inventory.get("0")).toBeUndefined();
    });

    it("returns 0 when item not found", () => {
      const removed = player.removeItem("nonexistent", 1);
      expect(removed).toBe(0);
    });

    it("removes across multiple stacks", () => {
      // Create two stacks of 3 (maxStack 3)
      player.addItem("potion", 6, 3);
      // Should have slot 0 = 3, slot 1 = 3
      const removed = player.removeItem("potion", 5);
      expect(removed).toBe(5);
      // One slot should remain with 1
      expect(player.countItem("potion")).toBe(1);
    });

    it("returns actual quantity removed when not enough", () => {
      player.addItem("potion", 2, 10);
      const removed = player.removeItem("potion", 5);
      expect(removed).toBe(2);
    });
  });

  // ── swapSlots ──────────────────────────────────────────────────────────────

  describe("swapSlots()", () => {
    const maxStackLookup = () => 5;

    it("moves item to an empty slot", () => {
      player.addItem("potion", 3, 5);
      const result = player.swapSlots(0, 5, maxStackLookup);
      expect(result).toBe(true);
      expect(player.inventory.get("0")).toBeUndefined();
      expect(player.inventory.get("5")!.itemId).toBe("potion");
      expect(player.inventory.get("5")!.quantity).toBe(3);
    });

    it("swaps two different items", () => {
      player.addItem("potion", 2, 5);
      player.addItem("key", 1, 1);
      const result = player.swapSlots(0, 1, maxStackLookup);
      expect(result).toBe(true);
      expect(player.inventory.get("0")!.itemId).toBe("key");
      expect(player.inventory.get("1")!.itemId).toBe("potion");
    });

    it("stacks same items when destination has room", () => {
      player.addItem("potion", 5, 5); // fills slot 0 with 5
      player.addItem("potion", 2, 5); // fills slot 1 with 2
      // Swap 1 → 0: slot 0 is full (5/5), so do plain swap
      const result = player.swapSlots(1, 0, maxStackLookup);
      expect(result).toBe(true);
      // Both slots full, should just swap quantities
      expect(player.inventory.get("0")!.quantity).toBe(2);
      expect(player.inventory.get("1")!.quantity).toBe(5);
    });

    it("merges same items fully when destination has enough room", () => {
      // Manually set up two separate potion stacks to avoid addItem auto-stacking
      const { InventorySlotState } = require("../src/state/InventorySlotState.js");
      const slot0 = new InventorySlotState();
      slot0.itemId = "potion";
      slot0.quantity = 3;
      player.inventory.set("0", slot0);

      const slot2 = new InventorySlotState();
      slot2.itemId = "potion";
      slot2.quantity = 2;
      player.inventory.set("2", slot2);

      const result = player.swapSlots(2, 0, () => 10);
      expect(result).toBe(true);
      expect(player.inventory.get("0")!.quantity).toBe(5);
      expect(player.inventory.get("2")).toBeUndefined(); // merged completely
    });

    it("returns false for same slot", () => {
      player.addItem("potion", 1, 5);
      expect(player.swapSlots(0, 0, maxStackLookup)).toBe(false);
    });

    it("returns false when source slot is empty", () => {
      expect(player.swapSlots(0, 1, maxStackLookup)).toBe(false);
    });

    it("returns false for out-of-bounds indices", () => {
      expect(player.swapSlots(-1, 0, maxStackLookup)).toBe(false);
      expect(player.swapSlots(0, INVENTORY_MAX_SLOTS, maxStackLookup)).toBe(false);
    });
  });

  // ── resetTalents ─────────────────────────────────────────────────────────

  describe("resetTalents()", () => {
    it("clears all talent allocations and refunds talent points", () => {
      // Simulate a level 10 player with some talents allocated
      player.level = 10;
      player.talentAllocations.set("talent_a", 2);
      player.talentAllocations.set("talent_b", 1);
      player.talentPoints = 0;

      const count = player.resetTalents();
      expect(count).toBe(2); // 2 talent entries cleared
      expect(player.talentAllocations.size).toBe(0);
      // Refund: max(0, 10 - TALENT_UNLOCK_LEVEL + 1) = max(0, 10 - 5 + 1) = 6
      expect(player.talentPoints).toBe(Math.max(0, 10 - TALENT_UNLOCK_LEVEL + 1));
    });

    it("returns 0 when no talents were allocated", () => {
      player.level = 8;
      const count = player.resetTalents();
      expect(count).toBe(0);
      expect(player.talentPoints).toBe(Math.max(0, 8 - TALENT_UNLOCK_LEVEL + 1));
    });

    it("refunds 0 talent points when below TALENT_UNLOCK_LEVEL", () => {
      player.level = 3; // below TALENT_UNLOCK_LEVEL (5)
      const count = player.resetTalents();
      expect(count).toBe(0);
      expect(player.talentPoints).toBe(0);
    });
  });

  // ── setLevel ─────────────────────────────────────────────────────────────

  describe("setLevel()", () => {
    it("returns false when target equals current level", () => {
      const result = player.setLevel(1);
      expect(result).toBe(false);
      expect(player.level).toBe(1);
    });

    it("levels UP preserving existing stats and talents", () => {
      player.strength = 12;
      player.statPoints = 0;
      player.talentAllocations.set("talent_a", 1);

      const result = player.setLevel(5);
      expect(result).toBe(false); // no talent reset on level up
      expect(player.level).toBe(5);
      // strength stays at 12 (preserved), statPoints += 4 (4 level-ups)
      expect(player.strength).toBe(12);
      expect(player.statPoints).toBe(4);
      // Talent allocation preserved
      expect(player.talentAllocations.size).toBe(1);
    });

    it("levels DOWN resetting stats to 10/10/10 and clearing talents", () => {
      // First level up to 10
      player.setLevel(10);
      player.strength = 15;
      player.talentAllocations.set("talent_a", 2);

      // Now level DOWN to 3
      const result = player.setLevel(3);
      expect(result).toBe(true); // talents were reset
      expect(player.level).toBe(3);
      expect(player.strength).toBe(10);
      expect(player.vitality).toBe(10);
      expect(player.agility).toBe(10);
      // statPoints = 2 (from levelUp calls for levels 2 and 3)
      expect(player.statPoints).toBe(2);
      expect(player.xp).toBe(0);
      expect(player.talentAllocations.size).toBe(0);
    });

    it("grants talent points when leveling up past TALENT_UNLOCK_LEVEL", () => {
      player.setLevel(TALENT_UNLOCK_LEVEL + 2);
      expect(player.level).toBe(TALENT_UNLOCK_LEVEL + 2);
      // Should have talent points for levels at/above TALENT_UNLOCK_LEVEL
      expect(player.talentPoints).toBe(3); // levels 5, 6, 7
    });
  });

  // ── splitSlot ────────────────────────────────────────────────────────────

  describe("splitSlot()", () => {
    const maxStackLookup = () => 10;

    it("splits a stack to an empty slot", () => {
      player.addItem("potion", 5, 10);
      const result = player.splitSlot(0, 3, 2, maxStackLookup);
      expect(result).toBe(true);
      expect(player.inventory.get("0")!.quantity).toBe(3);
      expect(player.inventory.get("3")!.itemId).toBe("potion");
      expect(player.inventory.get("3")!.quantity).toBe(2);
    });

    it("splits to a slot with the same item", () => {
      const slot0 = new InventorySlotState();
      slot0.itemId = "potion";
      slot0.quantity = 5;
      player.inventory.set("0", slot0);

      const slot1 = new InventorySlotState();
      slot1.itemId = "potion";
      slot1.quantity = 3;
      player.inventory.set("1", slot1);

      const result = player.splitSlot(0, 1, 2, maxStackLookup);
      expect(result).toBe(true);
      expect(player.inventory.get("0")!.quantity).toBe(3);
      expect(player.inventory.get("1")!.quantity).toBe(5);
    });

    it("returns false for same slot", () => {
      player.addItem("potion", 5, 10);
      expect(player.splitSlot(0, 0, 2, maxStackLookup)).toBe(false);
    });

    it("returns false for out-of-bounds indices", () => {
      player.addItem("potion", 5, 10);
      expect(player.splitSlot(-1, 3, 2, maxStackLookup)).toBe(false);
      expect(player.splitSlot(0, INVENTORY_MAX_SLOTS, 2, maxStackLookup)).toBe(false);
    });

    it("returns false when quantity >= current stack size", () => {
      player.addItem("potion", 5, 10);
      expect(player.splitSlot(0, 3, 5, maxStackLookup)).toBe(false);
      expect(player.splitSlot(0, 3, 6, maxStackLookup)).toBe(false);
    });

    it("returns false when quantity is 0 or negative", () => {
      player.addItem("potion", 5, 10);
      expect(player.splitSlot(0, 3, 0, maxStackLookup)).toBe(false);
      expect(player.splitSlot(0, 3, -1, maxStackLookup)).toBe(false);
    });

    it("returns false when source slot is empty", () => {
      expect(player.splitSlot(0, 3, 2, maxStackLookup)).toBe(false);
    });

    it("returns false when destination has a different item", () => {
      player.addItem("potion", 5, 10);
      player.addItem("key", 1, 1);
      expect(player.splitSlot(0, 1, 2, maxStackLookup)).toBe(false);
    });

    it("returns false when destination same-item stack is full", () => {
      const slot0 = new InventorySlotState();
      slot0.itemId = "potion";
      slot0.quantity = 5;
      player.inventory.set("0", slot0);

      const slot1 = new InventorySlotState();
      slot1.itemId = "potion";
      slot1.quantity = 10;
      player.inventory.set("1", slot1);

      // maxStack is 10, slot1 is already at 10
      expect(player.splitSlot(0, 1, 2, maxStackLookup)).toBe(false);
    });

    it("clamps split quantity to available room in destination", () => {
      const slot0 = new InventorySlotState();
      slot0.itemId = "potion";
      slot0.quantity = 5;
      player.inventory.set("0", slot0);

      const slot1 = new InventorySlotState();
      slot1.itemId = "potion";
      slot1.quantity = 8;
      player.inventory.set("1", slot1);

      // maxStack 10, slot1 can hold 2 more, but we request 3
      const result = player.splitSlot(0, 1, 3, maxStackLookup);
      expect(result).toBe(true);
      // Only 2 moved (clamped to canAdd)
      expect(player.inventory.get("0")!.quantity).toBe(3);
      expect(player.inventory.get("1")!.quantity).toBe(10);
    });
  });

  // ── equipItem ────────────────────────────────────────────────────────────

  describe("equipItem()", () => {
    it("equips item from inventory to empty equipment slot", () => {
      const slot = new InventorySlotState();
      slot.itemId = "iron_sword";
      slot.quantity = 1;
      slot.instanceId = "inst_001";
      player.inventory.set("0", slot);

      const result = player.equipItem(0, "weapon");
      expect(result).toBe(true);
      // Inventory slot should be removed
      expect(player.inventory.get("0")).toBeUndefined();
      // Equipment slot should have the instance
      expect(player.equipment.get("weapon")).toBeDefined();
      expect(player.equipment.get("weapon")!.instanceId).toBe("inst_001");
    });

    it("returns false when inventory slot has no instanceId", () => {
      const slot = new InventorySlotState();
      slot.itemId = "potion";
      slot.quantity = 3;
      // No instanceId (consumable, not equipment)
      player.inventory.set("0", slot);

      expect(player.equipItem(0, "weapon")).toBe(false);
    });

    it("returns false when inventory slot does not exist", () => {
      expect(player.equipItem(0, "weapon")).toBe(false);
    });

    it("swaps with existing equipped item", () => {
      // Set up instance item id mappings
      player.instanceItemIds.set("inst_old", "old_sword");
      player.instanceItemIds.set("inst_new", "new_sword");

      // Equip an existing item
      const eqSlot = new EquipmentSlotState();
      eqSlot.instanceId = "inst_old";
      player.equipment.set("weapon", eqSlot);

      // Put new item in inventory
      const invSlot = new InventorySlotState();
      invSlot.itemId = "new_sword";
      invSlot.quantity = 1;
      invSlot.instanceId = "inst_new";
      player.inventory.set("2", invSlot);

      const result = player.equipItem(2, "weapon");
      expect(result).toBe(true);

      // Equipment should now have new item
      expect(player.equipment.get("weapon")!.instanceId).toBe("inst_new");
      // Inventory slot 2 should now have old item
      expect(player.inventory.get("2")!.instanceId).toBe("inst_old");
      expect(player.inventory.get("2")!.itemId).toBe("old_sword");
    });
  });

  // ── setter proxies ────────────────────────────────────────────────────────

  describe("setter proxies (xpToNext, role)", () => {
    it("xpToNext setter writes to secret and getter reads back", () => {
      player.xpToNext = 999;
      expect(player.xpToNext).toBe(999);
      // Verify it wrote through to the secret state
      expect(player.secret.xpToNext).toBe(999);
    });

    it("role setter writes to secret and getter reads back", () => {
      player.role = "admin";
      expect(player.role).toBe("admin");
      expect(player.secret.role).toBe("admin");
    });

    it("role can be set back to user", () => {
      player.role = "admin";
      player.role = "user";
      expect(player.role).toBe("user");
    });
  });

  // ── unequipItem ──────────────────────────────────────────────────────────

  describe("unequipItem()", () => {
    it("unequips item to first empty inventory slot", () => {
      player.instanceItemIds.set("inst_001", "iron_sword");

      const eqSlot = new EquipmentSlotState();
      eqSlot.instanceId = "inst_001";
      player.equipment.set("weapon", eqSlot);

      const result = player.unequipItem("weapon");
      expect(result).toBe(true);
      // Equipment slot should be removed
      expect(player.equipment.get("weapon")).toBeUndefined();
      // Should be in inventory slot 0
      expect(player.inventory.get("0")).toBeDefined();
      expect(player.inventory.get("0")!.instanceId).toBe("inst_001");
      expect(player.inventory.get("0")!.itemId).toBe("iron_sword");
    });

    it("returns false when equipment slot is empty", () => {
      expect(player.unequipItem("weapon")).toBe(false);
    });

    it("returns false when inventory is full", () => {
      player.instanceItemIds.set("inst_001", "iron_sword");

      const eqSlot = new EquipmentSlotState();
      eqSlot.instanceId = "inst_001";
      player.equipment.set("weapon", eqSlot);

      // Fill all inventory slots
      for (let i = 0; i < INVENTORY_MAX_SLOTS; i++) {
        player.addItem(`item_${i}`, 1, 1);
      }

      const result = player.unequipItem("weapon");
      expect(result).toBe(false);
      // Equipment should still be there
      expect(player.equipment.get("weapon")!.instanceId).toBe("inst_001");
    });
  });
});
