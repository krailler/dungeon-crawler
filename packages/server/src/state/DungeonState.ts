import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { EnemyState } from "./EnemyState";

export class DungeonState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: EnemyState }) enemies = new MapSchema<EnemyState>();
  @type("string") tileMapData: string = "";
  @type("string") floorVariantData: string = "";
  @type("uint16") mapWidth: number = 0;
  @type("uint16") mapHeight: number = 0;
}
