import { Schema, type } from "@colyseus/schema";

export class EquipmentSlotState extends Schema {
  /** UUID of the equipped item instance */
  @type("string") instanceId: string = "";
}
