import { MapSchema, Schema, type } from "@colyseus/schema";
import { InventorySlotState } from "./InventorySlotState";

export class LootBagState extends Schema {
  @type("float32") x: number = 0;
  @type("float32") z: number = 0;
  @type({ map: InventorySlotState }) items = new MapSchema<InventorySlotState>();
}
