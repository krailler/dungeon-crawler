import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type { LootTakeMessage } from "@dungeon/shared";

export type LootBagSlot = {
  itemId: string;
  quantity: number;
} | null;

type LootBagSnapshot = {
  /** ID of the currently open loot bag, or null if closed */
  lootBagId: string | null;
  /** Fixed-size slot array (null = empty slot, item taken) */
  slots: LootBagSlot[];
};

type Listener = () => void;

const listeners = new Set<Listener>();
let room: Room | null = null;
let lootBagId: string | null = null;
let slots: LootBagSlot[] = [];

let snapshot: LootBagSnapshot = { lootBagId: null, slots: [] };

function rebuildSnapshot(): void {
  snapshot = { lootBagId, slots: [...slots] };
}

const emit = (): void => {
  rebuildSnapshot();
  for (const listener of listeners) {
    listener();
  }
};

/** Read items from the Schema MapSchema state for the given bag into a fixed slot array */
function readBagSlots(bagId: string): LootBagSlot[] {
  if (!room) return [];
  const bag = (room.state as any).lootBags?.get(bagId);
  if (!bag) return [];
  // Find max slot index to size the array
  let maxIndex = -1;
  bag.items.forEach((_item: any, key: string) => {
    const idx = Number(key);
    if (idx > maxIndex) maxIndex = idx;
  });
  if (maxIndex < 0) return [];
  const result: LootBagSlot[] = Array.from({ length: maxIndex + 1 }, () => null);
  bag.items.forEach((item: any, key: string) => {
    result[Number(key)] = { itemId: item.itemId, quantity: item.quantity };
  });
  return result;
}

export const lootBagStore = {
  setRoom(r: Room): void {
    room = r;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): LootBagSnapshot {
    return snapshot;
  },

  /** Open the loot bag panel for a specific bag */
  open(id: string): void {
    lootBagId = id;
    slots = readBagSlots(id);
    emit();
  },

  /** Close the loot bag panel */
  close(): void {
    if (lootBagId === null) return;
    lootBagId = null;
    slots = [];
    emit();
  },

  /** Refresh slots from Schema state (call when bag contents change) */
  refresh(): void {
    if (!lootBagId) return;
    const newSlots = readBagSlots(lootBagId);
    // Auto-close if bag is gone or all slots empty
    if (newSlots.every((s) => s === null)) {
      lootBagId = null;
      slots = [];
    } else {
      // Keep same array length so grid doesn't shrink
      if (newSlots.length < slots.length) {
        while (newSlots.length < slots.length) newSlots.push(null);
      }
      slots = newSlots;
    }
    emit();
  },

  /** Take an item from the currently open bag by slot index */
  take(slotIndex: number): void {
    if (!room || !lootBagId) return;
    const slot = slots[slotIndex];
    if (!slot) return;
    const msg: LootTakeMessage = {
      lootBagId,
      itemIndex: slotIndex,
      itemId: slot.itemId,
    };
    room.send(MessageType.LOOT_TAKE, msg);
  },

  reset(): void {
    room = null;
    lootBagId = null;
    slots = [];
    emit();
  },
};
