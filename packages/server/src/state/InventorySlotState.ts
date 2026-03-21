import { Schema, type } from "@colyseus/schema";

export class InventorySlotState extends Schema {
  @type("string") itemId: string = "";
  @type("uint16") quantity: number = 0;
  /** UUID of the item instance (non-empty for equipment with rolled stats) */
  @type("string") instanceId: string = "";
}
