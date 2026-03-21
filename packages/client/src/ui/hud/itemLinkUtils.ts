import { itemDefStore } from "../stores/itemDefStore";
import { t as tFn } from "../../i18n/i18n";

// ── Item link regex ──────────────────────────────────────────────────────────

/** Matches [item:itemId] and [item:itemId:instanceId] */
export const ITEM_LINK_RE = /\[item:([a-zA-Z0-9_]+)(?::([a-f0-9-]+))?\]/g;

// ── Chat send callback ──────────────────────────────────────────────────────

let sendChatFn: ((text: string) => void) | null = null;

export function setChatSendFn(fn: (text: string) => void): void {
  sendChatFn = fn;
}

export function clearChatSendFn(): void {
  sendChatFn = null;
}

export function chatSend(text: string): void {
  sendChatFn?.(text);
}

// ── Item link insertion callback ─────────────────────────────────────────────

let insertItemLinkFn: ((itemId: string, instanceId?: string) => void) | null = null;

export function setInsertItemLinkFn(fn: (itemId: string, instanceId?: string) => void): void {
  insertItemLinkFn = fn;
}

export function clearInsertItemLinkFn(): void {
  insertItemLinkFn = null;
}

/** Insert an item link into the chat input. Includes instanceId for equipment. */
export function insertItemLink(itemId: string, instanceId?: string): void {
  insertItemLinkFn?.(itemId, instanceId);
}

// ── Item link text resolution ────────────────────────────────────────────────

/** Replace [item:id] and [item:id:instanceId] tokens with translated item names */
export function resolveItemLinksToText(text: string): string {
  return text.replace(ITEM_LINK_RE, (_match, itemId: string) => {
    const def = itemDefStore.getSnapshot().get(itemId);
    if (!def) return `[${itemId}]`;
    return `[${tFn(def.name, { defaultValue: def.name })}]`;
  });
}
