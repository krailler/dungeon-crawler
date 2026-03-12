import { Schema, defineTypes } from "@colyseus/schema";

export class EnemyState extends Schema {
  // Synced fields — use `declare` to avoid esbuild overwriting Schema descriptors
  declare x: number;
  declare z: number;
  declare rotY: number;
  declare health: number;
  declare maxHealth: number;
  declare isDead: boolean;

  // Server-only (not synced — not in defineTypes)
  path: { x: number; z: number }[] = [];
  currentPathIndex: number = 0;
  speed: number = 0;
  isMoving: boolean = false;
}

defineTypes(EnemyState, {
  x: "float32",
  z: "float32",
  rotY: "float32",
  health: "int16",
  maxHealth: "int16",
  isDead: "boolean",
});
