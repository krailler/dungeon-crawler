import { itemDefStore } from "../stores/itemDefStore";
import { t as tFn } from "../../i18n/i18n";

// ── Item link regex ──────────────────────────────────────────────────────────

export const ITEM_LINK_RE = /\[item:([a-zA-Z0-9_]+)\]/g;

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

let insertItemLinkFn: ((itemId: string) => void) | null = null;

export function setInsertItemLinkFn(fn: (itemId: string) => void): void {
  insertItemLinkFn = fn;
}

export function clearInsertItemLinkFn(): void {
  insertItemLinkFn = null;
}

/** Insert an item link into the chat input (called from InventoryPanel on Shift+click) */
export function insertItemLink(itemId: string): void {
  insertItemLinkFn?.(itemId);
}

// ── Item link text resolution ────────────────────────────────────────────────

/** Replace [item:id] tokens with translated item names (plain text, for chat bubbles etc.) */
export function resolveItemLinksToText(text: string): string {
  return text.replace(ITEM_LINK_RE, (_match, itemId: string) => {
    const def = itemDefStore.getSnapshot().get(itemId);
    if (!def) return `[${itemId}]`;
    return `[${tFn(def.name, { defaultValue: def.name })}]`;
  });
}
