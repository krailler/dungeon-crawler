import { Schema, MapSchema, type, view } from "@colyseus/schema";
import {
  xpToNextLevel,
  MAX_LEVEL,
  INVENTORY_MAX_SLOTS,
  LifeState,
  PLAYER_SCALING,
  TALENT_UNLOCK_LEVEL,
} from "@dungeon/shared";
import type {
  AllocatableStatValue,
  RoleValue,
  StatScaling,
  EquipmentSlotValue,
} from "@dungeon/shared";
import { PlayerSecretState } from "./PlayerSecretState";
import { InventorySlotState } from "./InventorySlotState";
import { ActiveEffectState } from "./ActiveEffectState";
import { EquipmentSlotState } from "./EquipmentSlotState";

export class PlayerState extends Schema {
  // ── Public fields (visible to all clients) ─────────────────────────────────
  @type("float32") x: number = 0;
  @type("float32") z: number = 0;
  @type("float32") rotY: number = 0;
  @type("int16") health: number = 0;
  @type("int16") maxHealth: number = 0;
  @type("boolean") isMoving: boolean = false;
  @type("string") animState: string = "";
  @type("string") characterName: string = "";
  @type("boolean") online: boolean = true;
  @type("boolean") isLeader: boolean = false;
  @type("int16") level: number = 1;
  @type("boolean") isSprinting: boolean = false;
  @type("string") classId: string = "warrior";
  @type({ map: ActiveEffectState }) effects = new MapSchema<ActiveEffectState>();

  // ── Death / revive fields (visible to all clients) ────────────────────────
  @type("string") lifeState: string = LifeState.ALIVE;
  @type("float32") bleedTimer: number = 0;
  @type("float32") respawnTimer: number = 0;
  @type("float32") reviveProgress: number = 0;
  @type("string") reviverSessionId: string = "";

  // ── Private fields (only visible to the owning client via StateView) ───────
  @view() @type(PlayerSecretState) secret = new PlayerSecretState();

  // ── Server-only (not synced at all) ────────────────────────────────────────
  characterId: string = "";
  /** Stat scaling from the player's class (loaded from ClassRegistry on join) */
  statScaling: StatScaling = PLAYER_SCALING;
  path: { x: number; z: number }[] = [];
  /** Number of real deaths this session (for escalating respawn timer) */
  deathCount: number = 0;
  currentPathIndex: number = 0;
  attackRange: number = 2.5;
  tutorialsCompleted: Set<string> = new Set();
  /** Client wants to sprint (set by SPRINT message) */
  sprintRequested: boolean = false;
  /** Countdown before stamina regen begins after sprinting stops */
  staminaRegenDelay: number = 0;
  /** Creature being chased — server re-paths toward it each tick */
  chaseCreatureId: string | null = null;
  /** Per-item cooldown timers (seconds remaining) — server-only */
  itemCooldowns: Map<string, number> = new Map();
  /** Talent allocations (talentId → current rank) — server-only, not synced */
  talentAllocations: Map<string, number> = new Map();
  /** God mode: player takes no damage — server-only */
  godMode: boolean = false;
  /** Pacifist mode: attacks deal 0 effective damage to creatures — server-only */
  pacifist: boolean = false;

  // ── Convenience getters (delegate to secret for server-side code) ──────────

  get strength(): number {
    return this.secret.strength;
  }
  set strength(v: number) {
    this.secret.strength = v;
  }

  get vitality(): number {
    return this.secret.vitality;
  }
  set vitality(v: number) {
    this.secret.vitality = v;
  }

  get agility(): number {
    return this.secret.agility;
  }
  set agility(v: number) {
    this.secret.agility = v;
  }

  get attackDamage(): number {
    return this.secret.attackDamage;
  }
  set attackDamage(v: number) {
    this.secret.attackDamage = v;
  }

  get defense(): number {
    return this.secret.defense;
  }
  set defense(v: number) {
    this.secret.defense = v;
  }

  get speed(): number {
    return this.secret.speed;
  }
  set speed(v: number) {
    this.secret.speed = v;
  }

  get attackCooldown(): number {
    return this.secret.attackCooldown;
  }
  set attackCooldown(v: number) {
    this.secret.attackCooldown = v;
  }

  get gold(): number {
    return this.secret.gold;
  }
  set gold(v: number) {
    this.secret.gold = v;
  }

  get xp(): number {
    return this.secret.xp;
  }
  set xp(v: number) {
    this.secret.xp = v;
  }

  get xpToNext(): number {
    return this.secret.xpToNext;
  }
  set xpToNext(v: number) {
    this.secret.xpToNext = v;
  }

  get role(): RoleValue {
    return this.secret.role;
  }
  set role(v: RoleValue) {
    this.secret.role = v;
  }

  get skills() {
    return this.secret.skills;
  }

  get statPoints(): number {
    return this.secret.statPoints;
  }
  set statPoints(v: number) {
    this.secret.statPoints = v;
  }

  get autoAttackEnabled(): boolean {
    return this.secret.autoAttackEnabled;
  }
  set autoAttackEnabled(v: boolean) {
    this.secret.autoAttackEnabled = v;
  }

  get talentPoints(): number {
    return this.secret.talentPoints;
  }
  set talentPoints(v: number) {
    this.secret.talentPoints = v;
  }

  get stamina(): number {
    return this.secret.stamina;
  }
  set stamina(v: number) {
    this.secret.stamina = v;
  }

  get inventory() {
    return this.secret.inventory;
  }

  get consumableBar() {
    return this.secret.consumableBar;
  }

  get equipment() {
    return this.secret.equipment;
  }

  /**
   * Advance one level: grant +1 stat point, +1 talent point (if >= TALENT_UNLOCK_LEVEL).
   * Caller must call recomputeStats() after to apply derived stats + full heal.
   */
  levelUp(): void {
    this.level++;
    this.statPoints++;
    if (this.level >= TALENT_UNLOCK_LEVEL) {
      this.talentPoints++;
    }
    this.xpToNext = xpToNextLevel(this.level);
  }

  /**
   * Allocate one stat point to a base stat. Returns true on success.
   * Caller must call recomputeStats() after to update derived stats.
   */
  allocateStat(stat: AllocatableStatValue): boolean {
    if (this.statPoints <= 0) return false;
    this[stat]++;
    this.statPoints--;
    return true;
  }

  /**
   * Add XP and process any resulting level-ups.
   * Returns an array of new levels reached (empty if no level-up).
   */
  addXp(amount: number): number[] {
    if (this.level >= MAX_LEVEL) return [];
    this.xp += amount;

    const levelUps: number[] = [];
    while (this.level < MAX_LEVEL && this.xp >= xpToNextLevel(this.level)) {
      this.xp -= xpToNextLevel(this.level);
      this.levelUp();
      levelUps.push(this.level);
    }
    return levelUps;
  }

  /**
   * Reset all manually allocated stat points: revert to base 10/10/10 and refund.
   * Caller must call recomputeStats() after to update derived stats.
   * Returns the number of refunded points.
   */
  resetStats(): number {
    const spent = this.strength - 10 + (this.vitality - 10) + (this.agility - 10);
    this.strength = 10;
    this.vitality = 10;
    this.agility = 10;
    this.statPoints = this.level - 1;
    return spent;
  }

  /**
   * Reset all talent allocations and refund talent points based on current level.
   * Returns the number of talents that were reset.
   */
  resetTalents(): number {
    const count = this.talentAllocations.size;
    this.talentAllocations.clear();
    // Refund: one point per level at or above TALENT_UNLOCK_LEVEL
    this.talentPoints = Math.max(0, this.level - TALENT_UNLOCK_LEVEL + 1);
    return count;
  }

  /**
   * Set player to a specific level.
   * - Level UP: keeps current stats & talents, just adds the missing level-ups.
   * - Level DOWN: full reset (stats to 10/10/10, clear talents), then re-apply from 1.
   * Returns true if talents were reset (so the caller can notify the client).
   */
  setLevel(targetLevel: number): boolean {
    if (targetLevel === this.level) return false;

    if (targetLevel > this.level) {
      // Level UP — preserve existing allocations, just add the new levels
      for (let i = this.level; i < targetLevel; i++) {
        this.levelUp();
      }
      return false;
    }

    // Level DOWN — full reset required
    this.level = 1;
    this.strength = 10;
    this.vitality = 10;
    this.agility = 10;
    this.statPoints = 0;
    this.talentPoints = 0;
    this.talentAllocations.clear();
    this.xp = 0;
    this.xpToNext = xpToNextLevel(1);

    for (let i = 1; i < targetLevel; i++) {
      this.levelUp();
    }
    return true;
  }

  // ── Inventory helpers ──────────────────────────────────────────────────────

  /**
   * Add items to inventory. Stacks first, then fills empty slots.
   * Returns quantity actually added (may be less if inventory full).
   */
  addItem(itemId: string, qty: number, maxStack: number): number {
    let remaining = qty;

    // First pass: stack onto existing slots with same item
    this.inventory.forEach((slot) => {
      if (remaining <= 0) return;
      if (slot.itemId !== itemId) return;
      const canAdd = maxStack - slot.quantity;
      if (canAdd <= 0) return;
      const toAdd = Math.min(remaining, canAdd);
      slot.quantity += toAdd;
      remaining -= toAdd;
    });

    // Second pass: fill empty slot indexes
    if (remaining > 0) {
      const usedSlots = new Set<number>();
      this.inventory.forEach((_, key) => usedSlots.add(Number(key)));

      for (let i = 0; i < INVENTORY_MAX_SLOTS && remaining > 0; i++) {
        if (usedSlots.has(i)) continue;
        const slot = new InventorySlotState();
        slot.itemId = itemId;
        slot.quantity = Math.min(remaining, maxStack);
        remaining -= slot.quantity;
        this.inventory.set(String(i), slot);
      }
    }

    return qty - remaining;
  }

  /**
   * Remove qty of an item from inventory. Returns quantity actually removed.
   */
  removeItem(itemId: string, qty: number): number {
    let remaining = qty;
    const toDelete: string[] = [];

    this.inventory.forEach((slot, key) => {
      if (remaining <= 0) return;
      if (slot.itemId !== itemId) return;
      const take = Math.min(remaining, slot.quantity);
      slot.quantity -= take;
      remaining -= take;
      if (slot.quantity <= 0) toDelete.push(key);
    });

    for (const key of toDelete) {
      this.inventory.delete(key);
    }

    return qty - remaining;
  }

  /**
   * Swap two inventory slots. Handles move-to-empty, swap occupied, and same-item stacking.
   * Returns true if the operation succeeded.
   */
  swapSlots(from: number, to: number, maxStackLookup: (itemId: string) => number): boolean {
    if (from === to) return false;
    if (from < 0 || from >= INVENTORY_MAX_SLOTS) return false;
    if (to < 0 || to >= INVENTORY_MAX_SLOTS) return false;

    const fromKey = String(from);
    const toKey = String(to);
    const fromSlot = this.inventory.get(fromKey);
    const toSlot = this.inventory.get(toKey);

    // Nothing to move
    if (!fromSlot) return false;

    if (!toSlot) {
      // Move to empty slot
      const newSlot = new InventorySlotState();
      newSlot.itemId = fromSlot.itemId;
      newSlot.quantity = fromSlot.quantity;
      this.inventory.set(toKey, newSlot);
      this.inventory.delete(fromKey);
    } else if (fromSlot.itemId === toSlot.itemId) {
      // Same item — try to stack
      const maxStack = maxStackLookup(fromSlot.itemId);
      const canAdd = maxStack - toSlot.quantity;
      if (canAdd >= fromSlot.quantity) {
        // All fit into destination
        toSlot.quantity += fromSlot.quantity;
        this.inventory.delete(fromKey);
      } else if (canAdd > 0) {
        // Partial stack — fill destination, keep remainder in source
        toSlot.quantity += canAdd;
        fromSlot.quantity -= canAdd;
      } else {
        // Destination already full — plain swap
        const tmpId = fromSlot.itemId;
        const tmpQty = fromSlot.quantity;
        fromSlot.itemId = toSlot.itemId;
        fromSlot.quantity = toSlot.quantity;
        toSlot.itemId = tmpId;
        toSlot.quantity = tmpQty;
      }
    } else {
      // Different items — swap
      const tmpId = fromSlot.itemId;
      const tmpQty = fromSlot.quantity;
      fromSlot.itemId = toSlot.itemId;
      fromSlot.quantity = toSlot.quantity;
      toSlot.itemId = tmpId;
      toSlot.quantity = tmpQty;
    }

    return true;
  }

  /**
   * Split a stack: move `quantity` items from `from` slot to `to` slot.
   * Destination must be empty or contain the same itemId with room for more.
   */
  splitSlot(
    from: number,
    to: number,
    quantity: number,
    maxStackLookup: (itemId: string) => number,
  ): boolean {
    if (from === to) return false;
    if (from < 0 || from >= INVENTORY_MAX_SLOTS) return false;
    if (to < 0 || to >= INVENTORY_MAX_SLOTS) return false;

    const fromSlot = this.inventory.get(String(from));
    if (!fromSlot) return false;
    if (quantity <= 0 || quantity >= fromSlot.quantity) return false;

    const toSlot = this.inventory.get(String(to));

    if (!toSlot) {
      // Move to empty slot
      const newSlot = new InventorySlotState();
      newSlot.itemId = fromSlot.itemId;
      newSlot.quantity = quantity;
      this.inventory.set(String(to), newSlot);
      fromSlot.quantity -= quantity;
    } else if (toSlot.itemId === fromSlot.itemId) {
      // Same item — add to existing stack if room
      const maxStack = maxStackLookup(fromSlot.itemId);
      const canAdd = maxStack - toSlot.quantity;
      if (canAdd <= 0) return false;
      const toMove = Math.min(quantity, canAdd);
      toSlot.quantity += toMove;
      fromSlot.quantity -= toMove;
    } else {
      // Different item in destination — cannot split here
      return false;
    }

    return true;
  }

  /**
   * Count total quantity of an item across all inventory slots.
   */
  countItem(itemId: string): number {
    let total = 0;
    this.inventory.forEach((slot) => {
      if (slot.itemId === itemId) total += slot.quantity;
    });
    return total;
  }

  // ── Equipment helpers ───────────────────────────────────────────────────────

  /**
   * Equip an item from inventory. Moves it from the inventory slot to the
   * equipment slot. If the equipment slot is already occupied, swaps them.
   * Returns true on success.
   */
  equipItem(invSlotIndex: number, equipSlot: EquipmentSlotValue): boolean {
    const invKey = String(invSlotIndex);
    const invSlot = this.inventory.get(invKey);
    if (!invSlot || !invSlot.instanceId) return false;

    // Ensure the mapping exists for the item being equipped
    this.instanceItemIds.set(invSlot.instanceId, invSlot.itemId);

    const existingEquip = this.equipment.get(equipSlot);

    if (existingEquip && existingEquip.instanceId) {
      // Swap: move currently equipped item back to the same inventory slot
      const oldInstanceId = existingEquip.instanceId;
      const oldItemId = this.getItemIdForInstance(oldInstanceId);

      if (!oldItemId) {
        // instanceItemIds is missing the mapping — should not happen
        return false;
      }

      // Put new item into equipment
      existingEquip.instanceId = invSlot.instanceId;

      // Put old item into the inventory slot
      invSlot.itemId = oldItemId;
      invSlot.instanceId = oldInstanceId;
      invSlot.quantity = 1;
    } else {
      // Empty slot: equip and remove from inventory
      const eqSlot = new EquipmentSlotState();
      eqSlot.instanceId = invSlot.instanceId;
      this.equipment.set(equipSlot, eqSlot);
      this.inventory.delete(invKey);
    }

    return true;
  }

  /**
   * Unequip an item from an equipment slot back to inventory.
   * Returns true on success, false if no space in inventory.
   */
  unequipItem(equipSlot: EquipmentSlotValue): boolean {
    const eqSlot = this.equipment.get(equipSlot);
    if (!eqSlot || !eqSlot.instanceId) return false;

    // Find an empty inventory slot
    const usedSlots = new Set<number>();
    this.inventory.forEach((_, key) => usedSlots.add(Number(key)));

    let emptyIdx = -1;
    for (let i = 0; i < INVENTORY_MAX_SLOTS; i++) {
      if (!usedSlots.has(i)) {
        emptyIdx = i;
        break;
      }
    }
    if (emptyIdx === -1) return false; // inventory full

    const itemId = this.getItemIdForInstance(eqSlot.instanceId);

    const invSlot = new InventorySlotState();
    invSlot.itemId = itemId;
    invSlot.quantity = 1;
    invSlot.instanceId = eqSlot.instanceId;
    this.inventory.set(String(emptyIdx), invSlot);

    this.equipment.delete(equipSlot);
    return true;
  }

  /**
   * Server-only map: instanceId → itemId.
   * Populated by PlayerSessionManager when loading inventory/equipment.
   */
  instanceItemIds: Map<string, string> = new Map();

  /** Look up the item template id for an instance */
  getItemIdForInstance(instanceId: string): string {
    return this.instanceItemIds.get(instanceId) ?? "";
  }
}
