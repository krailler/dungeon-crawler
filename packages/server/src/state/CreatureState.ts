import { Schema, type } from "@colyseus/schema";
import type { DerivedStats } from "@dungeon/shared";
import { scaleCreatureDerivedStats } from "@dungeon/shared";

export class CreatureState extends Schema {
  @type("float32") x: number = 0;
  @type("float32") z: number = 0;
  @type("float32") rotY: number = 0;
  @type("int16") health: number = 0;
  @type("int16") maxHealth: number = 0;
  @type("boolean") isDead: boolean = false;
  @type("string") animState: string = "";
  @type("string") creatureType: string = "zombie";
  @type("int16") level: number = 1;

  // Server-only (not synced)
  path: { x: number; z: number }[] = [];
  currentPathIndex: number = 0;
  speed: number = 0;
  isMoving: boolean = false;
  attackDamage: number = 0;
  defense: number = 0;
  attackCooldown: number = 1.5;
  attackRange: number = 2.5;
  detectionRange: number = 12;

  /** Apply scaled stats from base derived stats at a given level */
  applyStats(baseDerived: DerivedStats, level: number): void {
    const derived = scaleCreatureDerivedStats(baseDerived, level);
    this.level = level;
    this.maxHealth = derived.maxHealth;
    this.health = derived.maxHealth;
    this.speed = derived.moveSpeed;
    this.attackDamage = derived.attackDamage;
    this.defense = derived.defense;
    this.attackCooldown = derived.attackCooldown;
    this.attackRange = derived.attackRange;
  }
}
