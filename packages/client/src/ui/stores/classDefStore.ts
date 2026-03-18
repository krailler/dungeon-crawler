import type { ClassDefClient } from "@dungeon/shared";
import { MessageType } from "@dungeon/shared";
import { createDefStore } from "./createDefStore";

export const classDefStore = createDefStore<ClassDefClient>({
  requestType: MessageType.CLASS_DEFS_REQUEST,
  responseType: MessageType.CLASS_DEFS_RESPONSE,
  requestKey: "classIds",
  responseKey: "classes",
});
