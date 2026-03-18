import { Schema, MapSchema, type, view } from "@colyseus/schema";
import {
  computeDerivedStats,
  xpToNextLevel,
  MAX_LEVEL,
  INVENTORY_MAX_SLOTS,
  LifeState,
  PLAYER_SCALING,
} from "@dungeon/shared";
import type { AllocatableStatValue, RoleValue, StatScaling } from "@dungeon/shared";
import { PlayerSecretState } from "./PlayerSecretState";
import { InventorySlotState } from "./InventorySlotState";
import { ActiveEffectState } from "./ActiveEffectState";

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
  speed: number = 0;
  attackCooldown: number = 1.0;
  attackRange: number = 2.5;
  tutorialsCompleted: Set<string> = new Set();
  /** Client wants to sprint (set by SPRINT message) */
  sprintRequested: boolean = false;
  /** Countdown before stamina regen begins after sprinting stops */
  staminaRegenDelay: number = 0;
  /** Per-item cooldown timers (seconds remaining) — server-only */
  itemCooldowns: Map<string, number> = new Map();

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

  get stamina(): number {
    return this.secret.stamina;
  }
  set stamina(v: number) {
    this.secret.stamina = v;
  }

  get inventory() {
    return this.secret.inventory;
  }

  /** Recompute all derived stats from current base stats and apply them. */
  applyDerivedStats(): void {
    const derived = computeDerivedStats(
      {
        strength: this.strength,
        vitality: this.vitality,
        agility: this.agility,
      },
      this.statScaling,
    );
    this.maxHealth = derived.maxHealth;
    this.attackDamage = derived.attackDamage;
    this.defense = derived.defense;
    this.speed = derived.moveSpeed;
    this.attackCooldown = derived.attackCooldown;
    this.attackRange = derived.attackRange;
  }

  /**
   * Advance one level: grant +1 stat point (player allocates manually), full heal.
   */
  levelUp(): void {
    this.level++;
    this.statPoints++;

    this.applyDerivedStats();
    this.health = this.maxHealth;
    this.xpToNext = xpToNextLevel(this.level);
  }

  /**
   * Allocate one stat point to a base stat. Returns true on success.
   */
  allocateStat(stat: AllocatableStatValue): boolean {
    if (this.statPoints <= 0) return false;
    const oldMaxHealth = this.maxHealth;
    this[stat]++;
    this.statPoints--;
    this.applyDerivedStats();
    // Grant the extra HP from vitality so current health increases too
    if (this.maxHealth > oldMaxHealth) {
      this.health = Math.min(this.health + (this.maxHealth - oldMaxHealth), this.maxHealth);
    }
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
   * Set player to a specific level: reset base stats to 10/10/10, grant
   * (targetLevel - 1) unassigned stat points, full heal, reset XP.
   */
  setLevel(targetLevel: number): void {
    this.level = targetLevel;
    this.strength = 10;
    this.vitality = 10;
    this.agility = 10;
    this.statPoints = targetLevel - 1;
    this.xp = 0;
    this.xpToNext = xpToNextLevel(targetLevel);

    this.applyDerivedStats();
    this.health = this.maxHealth;
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
   * Count total quantity of an item across all inventory slots.
   */
  countItem(itemId: string): number {
    let total = 0;
    this.inventory.forEach((slot) => {
      if (slot.itemId === itemId) total += slot.quantity;
    });
    return total;
  }
}
