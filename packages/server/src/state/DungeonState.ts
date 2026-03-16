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
  /** Incremented on each dungeon regeneration to force client re-render */
  @type("uint32") dungeonVersion: number = 0;
  @type("int16") dungeonLevel: number = 1;

  // ── Admin-only fields (sent via ADMIN_DEBUG_INFO message, not synced to all clients) ──
  dungeonSeed: number = 0;
  tickRate: number = 0;
  serverRuntime: string = "";
}
