import { Router } from "express";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db/database";
import { characters, characterInventory, characterEquipment, itemInstances } from "../db/schema";
import { getItemDef, getItemDefsForClient } from "../items/ItemRegistry";
import { authenticateRequest } from "./authMiddleware";
import { getAccountRoom } from "../sessions/reconnectionRegistry";
import { INVENTORY_MAX_SLOTS, EQUIPMENT_SLOTS } from "@dungeon/shared";
import type { EquipmentSlotValue } from "@dungeon/shared";
import { logger } from "../logger";

const router = Router();

/** Reject requests if the player is currently in a dungeon room */
function rejectIfInRoom(
  accountId: string,
  res: { status: (code: number) => { json: (body: unknown) => void } },
): boolean {
  const roomId = getAccountRoom(accountId);
  if (roomId) {
    res.status(409).json({ error: "Cannot modify inventory while in a dungeon" });
    return true;
  }
  return false;
}

/** Build the full inventory response for a character */
async function buildInventoryResponse(characterId: string) {
  const db = getDb();

  const [char] = await db
    .select({ gold: characters.gold })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  const invRows = await db
    .select()
    .from(characterInventory)
    .where(eq(characterInventory.characterId, characterId));

  const equipRows = await db
    .select()
    .from(characterEquipment)
    .where(eq(characterEquipment.characterId, characterId));

  // Collect all instance IDs and load them in one query
  const instanceIds: string[] = [];
  for (const row of invRows) {
    if (row.instanceId) instanceIds.push(row.instanceId);
  }
  for (const row of equipRows) {
    if (row.instanceId) instanceIds.push(row.instanceId);
  }

  let instances: { id: string; itemId: string; rolledStats: unknown; itemLevel: number }[] = [];
  if (instanceIds.length > 0) {
    instances = await db.select().from(itemInstances).where(inArray(itemInstances.id, instanceIds));
  }

  // Collect unique item IDs and resolve their definitions for the client
  const itemIdSet = new Set<string>();
  for (const r of invRows) itemIdSet.add(r.itemId);
  for (const inst of instances) itemIdSet.add(inst.itemId);
  const itemDefs = getItemDefsForClient(Array.from(itemIdSet));

  return {
    gold: char?.gold ?? 0,
    inventory: invRows.map((r) => ({
      slotIndex: r.slotIndex,
      itemId: r.itemId,
      quantity: r.quantity,
      instanceId: r.instanceId ?? null,
    })),
    equipment: equipRows.map((r) => ({
      slot: r.slot,
      instanceId: r.instanceId,
    })),
    instances: instances.map((i) => ({
      id: i.id,
      itemId: i.itemId,
      rolledStats: i.rolledStats as Record<string, number>,
      itemLevel: i.itemLevel,
    })),
    itemDefs,
  };
}

// ── GET /:characterId — full inventory + equipment + instances ──────────

router.get("/:characterId", async (req: any, res: any) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;

  try {
    const data = await buildInventoryResponse(auth.characterId);
    res.json(data);
  } catch (err) {
    logger.error({ err }, "Failed to load inventory");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:characterId/swap — swap two inventory slots ─────────────────

router.post("/:characterId/swap", async (req: any, res: any) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  if (rejectIfInRoom(auth.accountId, res)) return;

  const from = Math.floor(Number(req.body?.from));
  const to = Math.floor(Number(req.body?.to));
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    res.status(400).json({ error: "Invalid slot indices" });
    return;
  }
  if (from === to) {
    res.status(400).json({ error: "Cannot swap slot with itself" });
    return;
  }
  if (from < 0 || from >= INVENTORY_MAX_SLOTS || to < 0 || to >= INVENTORY_MAX_SLOTS) {
    res.status(400).json({ error: "Slot index out of range" });
    return;
  }

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(characterInventory)
      .where(
        and(
          eq(characterInventory.characterId, auth.characterId),
          inArray(characterInventory.slotIndex, [from, to]),
        ),
      );

    const slotA = rows.find((r) => r.slotIndex === from);
    const slotB = rows.find((r) => r.slotIndex === to);

    if (!slotA && !slotB) {
      res.status(400).json({ error: "Both slots empty" });
      return;
    }

    await db.transaction(async (tx) => {
      if (slotA && slotB) {
        // Swap via temporary index to avoid unique constraint violation
        await tx
          .update(characterInventory)
          .set({ slotIndex: -1 })
          .where(eq(characterInventory.id, slotB.id));
        await tx
          .update(characterInventory)
          .set({ slotIndex: to })
          .where(eq(characterInventory.id, slotA.id));
        await tx
          .update(characterInventory)
          .set({ slotIndex: from })
          .where(eq(characterInventory.id, slotB.id));
      } else if (slotA) {
        // Move A to empty slot B
        await tx
          .update(characterInventory)
          .set({ slotIndex: to })
          .where(eq(characterInventory.id, slotA.id));
      } else if (slotB) {
        // Move B to empty slot A
        await tx
          .update(characterInventory)
          .set({ slotIndex: from })
          .where(eq(characterInventory.id, slotB.id));
      }
    });

    logger.debug({ characterId: auth.characterId, from, to }, "Inventory slots swapped");
    const data = await buildInventoryResponse(auth.characterId);
    res.json(data);
  } catch (err) {
    logger.error({ err, characterId: auth.characterId }, "Failed to swap inventory slots");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:characterId/equip — equip item from inventory ───────────────

router.post("/:characterId/equip", async (req: any, res: any) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  if (rejectIfInRoom(auth.accountId, res)) return;

  const slotIndex = Math.floor(Number(req.body?.slotIndex));
  const equipSlot = String(req.body?.equipSlot ?? "");
  if (!Number.isFinite(slotIndex) || !equipSlot) {
    res.status(400).json({ error: "Invalid parameters" });
    return;
  }

  const validSlots = new Set(Object.values(EQUIPMENT_SLOTS));
  if (!validSlots.has(equipSlot as EquipmentSlotValue)) {
    res.status(400).json({ error: "Invalid equipment slot" });
    return;
  }

  try {
    const db = getDb();

    // Load the inventory slot
    const [invSlot] = await db
      .select()
      .from(characterInventory)
      .where(
        and(
          eq(characterInventory.characterId, auth.characterId),
          eq(characterInventory.slotIndex, slotIndex),
        ),
      )
      .limit(1);

    if (!invSlot || !invSlot.instanceId) {
      res.status(400).json({ error: "No equippable item in that slot" });
      return;
    }

    const itemDef = getItemDef(invSlot.itemId);
    if (!itemDef?.equipSlot) {
      res.status(400).json({ error: "Item is not equippable" });
      return;
    }

    // Validate slot compatibility
    const slotMatches =
      itemDef.equipSlot === equipSlot ||
      (itemDef.equipSlot.startsWith("accessory") && equipSlot.startsWith("accessory"));
    if (!slotMatches) {
      res.status(400).json({ error: "Item does not fit that slot" });
      return;
    }

    // Check level requirement
    const [char] = await db
      .select({ level: characters.level })
      .from(characters)
      .where(eq(characters.id, auth.characterId))
      .limit(1);

    if (!char) {
      res.status(500).json({ error: "Character not found" });
      return;
    }
    if (itemDef.levelReq > char.level) {
      res.status(400).json({ error: "Level too low" });
      return;
    }

    await db.transaction(async (tx) => {
      // Check if equipment slot already has an item (swap) — inside transaction
      const [existingEquip] = await tx
        .select()
        .from(characterEquipment)
        .where(
          and(
            eq(characterEquipment.characterId, auth.characterId),
            eq(characterEquipment.slot, equipSlot),
          ),
        )
        .limit(1);

      if (existingEquip) {
        // Swap: put old equipped item into inventory slot, equip new one
        const [oldInstance] = await tx
          .select({ itemId: itemInstances.itemId })
          .from(itemInstances)
          .where(eq(itemInstances.id, existingEquip.instanceId))
          .limit(1);

        // Update inventory slot with old equipped item
        await tx
          .update(characterInventory)
          .set({
            itemId: oldInstance?.itemId ?? "",
            quantity: 1,
            instanceId: existingEquip.instanceId,
          })
          .where(eq(characterInventory.id, invSlot.id));

        // Update equipment slot with new item
        await tx
          .update(characterEquipment)
          .set({ instanceId: invSlot.instanceId! })
          .where(
            and(
              eq(characterEquipment.characterId, auth.characterId),
              eq(characterEquipment.slot, equipSlot),
            ),
          );
      } else {
        // Empty slot: remove from inventory, add to equipment
        await tx.delete(characterInventory).where(eq(characterInventory.id, invSlot.id));

        await tx.insert(characterEquipment).values({
          characterId: auth.characterId,
          slot: equipSlot,
          instanceId: invSlot.instanceId!,
        });
      }
    });

    logger.info(
      { characterId: auth.characterId, equipSlot, invSlot: slotIndex },
      "Item equipped via REST",
    );
    const data = await buildInventoryResponse(auth.characterId);
    res.json(data);
  } catch (err) {
    logger.error({ err, characterId: auth.characterId }, "Failed to equip item");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── POST /:characterId/unequip — unequip item back to inventory ────────

router.post("/:characterId/unequip", async (req: any, res: any) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  if (rejectIfInRoom(auth.accountId, res)) return;

  const equipSlot = String(req.body?.equipSlot ?? "");
  const validSlots = new Set(Object.values(EQUIPMENT_SLOTS));
  if (!validSlots.has(equipSlot as EquipmentSlotValue)) {
    res.status(400).json({ error: "Invalid equipment slot" });
    return;
  }

  try {
    const db = getDb();

    // Find equipped item
    const [equip] = await db
      .select()
      .from(characterEquipment)
      .where(
        and(
          eq(characterEquipment.characterId, auth.characterId),
          eq(characterEquipment.slot, equipSlot),
        ),
      )
      .limit(1);

    if (!equip) {
      res.status(400).json({ error: "Nothing equipped in that slot" });
      return;
    }

    // Find an empty inventory slot
    const invRows = await db
      .select({ slotIndex: characterInventory.slotIndex })
      .from(characterInventory)
      .where(eq(characterInventory.characterId, auth.characterId));

    const usedSlots = new Set(invRows.map((r) => r.slotIndex));
    let emptyIdx = -1;
    for (let i = 0; i < INVENTORY_MAX_SLOTS; i++) {
      if (!usedSlots.has(i)) {
        emptyIdx = i;
        break;
      }
    }

    if (emptyIdx === -1) {
      res.status(400).json({ error: "Inventory full" });
      return;
    }

    // Get the item ID from the instance
    const [instance] = await db
      .select({ itemId: itemInstances.itemId })
      .from(itemInstances)
      .where(eq(itemInstances.id, equip.instanceId))
      .limit(1);

    await db.transaction(async (tx) => {
      // Remove from equipment
      await tx
        .delete(characterEquipment)
        .where(
          and(
            eq(characterEquipment.characterId, auth.characterId),
            eq(characterEquipment.slot, equipSlot),
          ),
        );

      // Add to inventory
      await tx.insert(characterInventory).values({
        characterId: auth.characterId,
        slotIndex: emptyIdx,
        itemId: instance?.itemId ?? "",
        quantity: 1,
        instanceId: equip.instanceId,
      });
    });

    logger.info({ characterId: auth.characterId, equipSlot }, "Item unequipped via REST");
    const data = await buildInventoryResponse(auth.characterId);
    res.json(data);
  } catch (err) {
    logger.error({ err, characterId: auth.characterId }, "Failed to unequip item");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ── DELETE /:characterId/destroy — destroy an inventory item ───────────

router.delete("/:characterId/destroy", async (req: any, res: any) => {
  const auth = await authenticateRequest(req, res);
  if (!auth) return;
  if (rejectIfInRoom(auth.accountId, res)) return;

  const slotIndex = Math.floor(Number(req.body?.slotIndex));
  if (!Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= INVENTORY_MAX_SLOTS) {
    res.status(400).json({ error: "Invalid slot index" });
    return;
  }

  try {
    const db = getDb();

    const [invSlot] = await db
      .select()
      .from(characterInventory)
      .where(
        and(
          eq(characterInventory.characterId, auth.characterId),
          eq(characterInventory.slotIndex, slotIndex),
        ),
      )
      .limit(1);

    if (!invSlot) {
      res.status(400).json({ error: "Slot is empty" });
      return;
    }

    await db.transaction(async (tx) => {
      // Delete inventory row
      await tx.delete(characterInventory).where(eq(characterInventory.id, invSlot.id));

      // Delete instance if it was a unique item
      if (invSlot.instanceId) {
        await tx.delete(itemInstances).where(eq(itemInstances.id, invSlot.instanceId));
      }
    });

    logger.info(
      {
        characterId: auth.characterId,
        slotIndex,
        itemId: invSlot.itemId,
        instanceId: invSlot.instanceId,
      },
      "Item destroyed via REST",
    );
    const data = await buildInventoryResponse(auth.characterId);
    res.json(data);
  } catch (err) {
    logger.error({ err, characterId: auth.characterId }, "Failed to destroy item");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
