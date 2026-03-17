import type { SkillDef } from "@dungeon/shared";
import { MessageType } from "@dungeon/shared";
import { createDefStore } from "./createDefStore";

export const skillDefStore = createDefStore<SkillDef>({
  requestType: MessageType.SKILL_DEFS_REQUEST,
  responseType: MessageType.SKILL_DEFS_RESPONSE,
  requestKey: "skillIds",
  responseKey: "skills",
});
