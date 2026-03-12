import { Schema, type } from "@colyseus/schema";

export class PlayerState extends Schema {
  @type("float32") x: number = 0;
  @type("float32") z: number = 0;
  @type("float32") rotY: number = 0;
  @type("int16") health: number = 0;
  @type("int16") maxHealth: number = 0;
  @type("boolean") isMoving: boolean = false;

  // Server-only (not synced)
  path: { x: number; z: number }[] = [];
  currentPathIndex: number = 0;
  speed: number = 0;
}
