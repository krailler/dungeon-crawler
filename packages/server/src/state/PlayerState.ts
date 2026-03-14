import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("float32") x: number = 0;
  @type("float32") z: number = 0;
  @type("float32") rotY: number = 0;
  @type("int16") health: number = 0;
  @type("int16") maxHealth: number = 0;
  @type("boolean") isMoving: boolean = false;
  @type("string") animState: string = "";
  @type("string") characterName: string = "";
  @type("string") role: string = "user";
  @type("boolean") online: boolean = true;
  @type("boolean") isLeader: boolean = false;

  // Base stats (synced for future character sheet UI)
  @type("int16") strength: number = 10;
  @type("int16") vitality: number = 10;
  @type("int16") agility: number = 10;
  @type("int16") level: number = 1;

  // Derived stats (synced for client display)
  @type("int16") attackDamage: number = 0;
  @type("int16") defense: number = 0;

  // Server-only (not synced)
  path: { x: number; z: number }[] = [];
  currentPathIndex: number = 0;
  speed: number = 0;
  attackCooldown: number = 1.0;
  attackRange: number = 2.5;
}
