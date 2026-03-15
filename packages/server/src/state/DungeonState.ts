import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { EnemyState } from "./EnemyState";
import { GateState } from "./GateState";

export class DungeonState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: EnemyState }) enemies = new MapSchema<EnemyState>();
  @type({ map: GateState }) gates = new MapSchema<GateState>();
  @type("string") tileMapData: string = "";
  @type("string") floorVariantData: string = "";
  @type("string") wallVariantData: string = "";
  @type("uint16") mapWidth: number = 0;
  @type("uint16") mapHeight: number = 0;
  @type("uint32") dungeonSeed: number = 0;
  /** Incremented on each dungeon regeneration to force client re-render */
  @type("uint32") dungeonVersion: number = 0;
  @type("int16") dungeonLevel: number = 1;
  @type("float32") tickRate: number = 0;
}
