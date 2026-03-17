import { Schema, type } from "@colyseus/schema";

export class ActiveEffectState extends Schema {
  @type("string") effectId: string = "";
  @type("float32") remaining: number = 0;
  @type("float32") duration: number = 0;
  @type("int8") stacks: number = 1;
}
