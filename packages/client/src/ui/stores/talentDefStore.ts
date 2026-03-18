import type { TalentDefClient } from "@dungeon/shared";
import { MessageType } from "@dungeon/shared";
import { createDefStore } from "./createDefStore";

export const talentDefStore = createDefStore<TalentDefClient>({
  requestType: MessageType.TALENT_DEFS_REQUEST,
  responseType: MessageType.TALENT_DEFS_RESPONSE,
  requestKey: "talentIds",
  responseKey: "talents",
});
