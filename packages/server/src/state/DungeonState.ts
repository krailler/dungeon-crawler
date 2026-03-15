import { Schema, MapSchema, type } from "@colyseus/schema";
import { PlayerState } from "./PlayerState";
import { EnemyState } from "./EnemyState";

export class DungeonState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
  @type({ map: EnemyState }) enemies = new MapSchema<EnemyState>();
  @type("string") tileMapData: string = "";
  @type("string") floorVariantData: string = "";
  @type("string") wallVariantData: string = "";
  @type("uint16") mapWidth: number = 0;
  @type("uint16") mapHeight: number = 0;
  @type("uint32") dungeonSeed: number = 0;
  @type("float32") tickRate: number = 0;
  @type("boolean") gateOpen: boolean = false;
  @type("int16") gateX: number = -1;
  @type("int16") gateY: number = -1;
  /** true = corridor exits N or S (gate bars run E-W), false = E or W */
  @type("boolean") gateNS: boolean = false;
  /** Direction the corridor exits: 0=N 1=S 2=W 3=E */
  @type("uint8") gateDir: number = 0;
}
