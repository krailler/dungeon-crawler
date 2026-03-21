import { ArraySchema, MapSchema, Schema, type } from "@colyseus/schema";
import { Role } from "@dungeon/shared";
import type { RoleValue } from "@dungeon/shared";
import { InventorySlotState } from "./InventorySlotState";
import { EquipmentSlotState } from "./EquipmentSlotState";

/**
 * Private player data — only visible to the owning client via @view().
 * Contains economy, progression, stats, and skill data.
 */
export class PlayerSecretState extends Schema {
  // Base stats
  @type("int16") strength: number = 10;
  @type("int16") vitality: number = 10;
  @type("int16") agility: number = 10;

  // Derived stats
  @type("int16") attackDamage: number = 0;
  @type("int16") defense: number = 0;
  @type("float32") speed: number = 0;
  @type("float32") attackCooldown: number = 1.0;

  // Stat points (unassigned)
  @type("int16") statPoints: number = 0;

  // Talent points (unassigned)
  @type("int16") talentPoints: number = 0;

  // Economy & progression
  @type("int32") gold: number = 0;
  @type("int32") xp: number = 0;
  @type("int32") xpToNext: number = 0;

  // Skills
  @type(["string"]) skills = new ArraySchema<string>();
  @type("boolean") autoAttackEnabled: boolean = true;

  // Stamina (sprint resource — ephemeral, not persisted)
  @type("float32") stamina: number = 100;

  // Inventory (slot index → item+qty)
  @type({ map: InventorySlotState }) inventory = new MapSchema<InventorySlotState>();

  // Consumable bar (itemId per slot, empty string = unassigned)
  @type(["string"]) consumableBar = new ArraySchema<string>();

  // Equipment (slot name → equipped instance)
  @type({ map: EquipmentSlotState }) equipment = new MapSchema<EquipmentSlotState>();

  // Role (admin/user)
  @type("string") role: RoleValue = Role.USER;
}
