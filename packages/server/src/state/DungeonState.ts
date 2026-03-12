import { Schema, MapSchema, defineTypes } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { EnemyState } from "./EnemyState";

export class DungeonState extends Schema {
  // Synced fields — use `declare` to avoid esbuild overwriting Schema descriptors
  declare players: MapSchema<PlayerState>;
  declare enemies: MapSchema<EnemyState>;
  declare tileMapData: string;
  declare mapWidth: number;
  declare mapHeight: number;
}

defineTypes(DungeonState, {
  players: { map: PlayerState },
  enemies: { map: EnemyState },
  tileMapData: "string",
  mapWidth: "uint16",
  mapHeight: "uint16",
});
