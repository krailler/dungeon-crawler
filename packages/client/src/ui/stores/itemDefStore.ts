import type { ItemDefClient } from "@dungeon/shared";
import { MessageType } from "@dungeon/shared";
import { createDefStore } from "./createDefStore";

export const itemDefStore = createDefStore<ItemDefClient>({
  requestType: MessageType.ITEM_DEFS_REQUEST,
  responseType: MessageType.ITEM_DEFS_RESPONSE,
  requestKey: "itemIds",
  responseKey: "items",
});
