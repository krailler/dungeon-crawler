import { Schema, type } from "@colyseus/schema";
import { GateType } from "@dungeon/shared";
import type { GateTypeValue } from "@dungeon/shared";

export class GateState extends Schema {
  @type("string") id: string = "";
  @type("string") gateType: GateTypeValue = GateType.LOBBY;
  @type("int16") tileX: number = -1;
  @type("int16") tileY: number = -1;
  @type("boolean") isNS: boolean = false;
  @type("uint8") dir: number = 0; // 0=N 1=S 2=W 3=E
  @type("boolean") open: boolean = false;
}
