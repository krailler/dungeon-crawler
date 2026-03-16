import { Schema, type } from "@colyseus/schema";

export class InventorySlotState extends Schema {
  @type("string") itemId: string = "";
  @type("uint16") quantity: number = 0;
}
