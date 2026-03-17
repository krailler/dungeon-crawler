import type { EffectDef } from "@dungeon/shared";
import { MessageType } from "@dungeon/shared";
import { createDefStore } from "./createDefStore";

export const effectDefStore = createDefStore<EffectDef>({
  requestType: MessageType.EFFECT_DEFS_REQUEST,
  responseType: MessageType.EFFECT_DEFS_RESPONSE,
  requestKey: "effectIds",
  responseKey: "effects",
});
