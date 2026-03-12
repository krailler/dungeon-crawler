import { Schema, defineTypes } from "@colyseus/schema";

export class PlayerState extends Schema {
  // Synced fields — use `declare` so esbuild/tsx won't emit
  // Object.defineProperty that overwrites Schema's property descriptors.
  declare x: number;
  declare z: number;
  declare rotY: number;
  declare health: number;
  declare maxHealth: number;
  declare isMoving: boolean;

  // Server-only (not synced — not in defineTypes)
  path: { x: number; z: number }[] = [];
  currentPathIndex: number = 0;
  speed: number = 0;
}

defineTypes(PlayerState, {
  x: "float32",
  z: "float32",
  rotY: "float32",
  health: "int16",
  maxHealth: "int16",
  isMoving: "boolean",
});
