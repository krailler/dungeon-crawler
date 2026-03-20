import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ReactNode, DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { MAX_CONSUMABLE_BAR_SLOTS } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import { itemDefStore } from "../stores/itemDefStore";
import { settingsStore, displayKeyName } from "../stores/settingsStore";
import { ActionSlot } from "../components/ActionSlot";
import { ItemIcon } from "../components/ItemIcon";
import { playUiSfx } from "../../audio/uiSfx";
import { EMPTY_DRAG_IMG } from "../utils/dragGhost";

/** MIME type for items dragged from inventory to consumable bar */
const CONSUMABLE_ITEM_MIME = "application/x-consumable-item";
/** MIME type for reordering within the consumable bar */
const CONSUMABLE_BAR_SLOT_MIME = "application/x-consumable-bar-slot";

// ── ConsumableBar ───────────────────────────────────────────────────────────

export const ConsumableBar = (): ReactNode => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);
  const localMember = useMemo(() => snapshot.members.find((m) => m.isLocal), [snapshot.members]);

  const consumableBar = localMember?.consumableBar ?? [];
  const inventory = localMember?.inventory;

  // Ensure item defs are loaded for all assigned consumable bar items
  const assignedItemIds = useMemo(() => consumableBar.filter((id) => id !== ""), [consumableBar]);
  useEffect(() => {
    if (assignedItemIds.length > 0) itemDefStore.ensureLoaded(assignedItemIds);
  }, [assignedItemIds]);

  // Compute total quantity per itemId from inventory
  const qtyByItem = useMemo(() => {
    const map = new Map<string, number>();
    if (!inventory) return map;
    for (const slot of inventory) {
      map.set(slot.itemId, (map.get(slot.itemId) ?? 0) + slot.quantity);
    }
    return map;
  }, [inventory]);

  // Keybinding keys for each slot
  const bindKeys = useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < MAX_CONSUMABLE_BAR_SLOTS; i++) {
      const action = `consumable_${i + 1}` as keyof typeof settings.keybindings;
      keys.push(settings.keybindings[action] ?? String(i + 1));
    }
    return keys;
  }, [settings.keybindings]);

  // Activation counter for click pulse animation
  const [activations, setActivations] = useState<number[]>(() =>
    Array.from({ length: MAX_CONSUMABLE_BAR_SLOTS }, () => 0),
  );

  const handleUse = useCallback(
    (slotIndex: number) => {
      const itemId = consumableBar[slotIndex];
      if (!itemId) return;
      hudStore.useItem(itemId);
      setActivations((prev) => {
        const next = [...prev];
        next[slotIndex] = (next[slotIndex] ?? 0) + 1;
        return next;
      });
    },
    [consumableBar],
  );

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      for (let i = 0; i < MAX_CONSUMABLE_BAR_SLOTS; i++) {
        if (e.key.toLowerCase() === bindKeys[i].toLowerCase()) {
          handleUse(i);
          return;
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [bindKeys, handleUse]);

  // ── Drag state ──────────────────────────────────────────────────────────
  const [dragOverSlot, setDragOverSlot] = useState<number | null>(null);
  const [dragSourceSlot, setDragSourceSlot] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const barRef = useRef<HTMLDivElement>(null);

  const dropHandledRef = useRef(false);
  const dragSourceSlotRef = useRef<number | null>(null);
  dragSourceSlotRef.current = dragSourceSlot;

  // Global listeners during drag: track mouse + accept drops anywhere to avoid snap-back
  useEffect(() => {
    if (dragSourceSlot === null) return;
    const onDragOver = (e: globalThis.DragEvent): void => {
      e.preventDefault(); // allow drop anywhere (prevents snap-back animation)
      if (e.clientX === 0 && e.clientY === 0) return;
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    const onDrop = (e: globalThis.DragEvent): void => {
      e.preventDefault();
      // If no slot handled the drop, unassign (dragged outside)
      if (!dropHandledRef.current && dragSourceSlotRef.current !== null) {
        playUiSfx("ui_click");
        hudStore.unassignConsumableBar(dragSourceSlotRef.current);
      }
      setDragSourceSlot(null);
      setDragOverSlot(null);
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [dragSourceSlot]);

  const handleSlotDragStart = useCallback(
    (slotIndex: number, e: DragEvent<HTMLDivElement>) => {
      const itemId = consumableBar[slotIndex];
      if (!itemId) {
        e.preventDefault();
        return;
      }
      if (EMPTY_DRAG_IMG) e.dataTransfer.setDragImage(EMPTY_DRAG_IMG, 0, 0);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData(CONSUMABLE_BAR_SLOT_MIME, String(slotIndex));
      dropHandledRef.current = false;
      setMousePos({ x: e.clientX, y: e.clientY });
      setDragSourceSlot(slotIndex);
    },
    [consumableBar],
  );

  const handleSlotDragOver = useCallback((slotIndex: number, e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverSlot(slotIndex);
  }, []);

  const handleSlotDragLeave = useCallback(() => {
    setDragOverSlot(null);
  }, []);

  const handleSlotDrop = useCallback((slotIndex: number, e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dropHandledRef.current = true;
    setDragOverSlot(null);
    setDragSourceSlot(null);

    // Check if it's a reorder within the consumable bar
    const barSlotData = e.dataTransfer.getData(CONSUMABLE_BAR_SLOT_MIME);
    if (barSlotData !== "") {
      const fromSlot = Number(barSlotData);
      if (fromSlot !== slotIndex) {
        playUiSfx("ui_click");
        hudStore.swapConsumableBarSlots(fromSlot, slotIndex);
      }
      return;
    }

    // Check if it's an item dragged from inventory
    const itemId = e.dataTransfer.getData(CONSUMABLE_ITEM_MIME);
    if (itemId) {
      playUiSfx("ui_click");
      hudStore.assignConsumableBar(slotIndex, itemId);
    }
  }, []);

  const handleSlotDragEnd = useCallback(() => {
    setDragSourceSlot(null);
    setDragOverSlot(null);
  }, []);

  const clickToUse = t("inventory.clickToUse");
  const dragToAssign = t("consumableBar.dragToAssign");

  // Drag ghost
  const dragSlotItemId = dragSourceSlot !== null ? consumableBar[dragSourceSlot] : null;
  const dragItemDef = dragSlotItemId ? itemDefs.get(dragSlotItemId) : undefined;

  return (
    <>
      <div ref={barRef} className="flex items-center gap-1.5">
        {Array.from({ length: MAX_CONSUMABLE_BAR_SLOTS }, (_, i) => {
          const itemId = consumableBar[i] ?? "";
          const def = itemId ? itemDefs.get(itemId) : undefined;
          const qty = itemId ? (qtyByItem.get(itemId) ?? 0) : 0;
          const hasItem = !!itemId;
          const isEmpty = qty === 0;

          return (
            <div
              key={i}
              data-drop-zone
              draggable={hasItem}
              onDragStart={(e) => handleSlotDragStart(i, e)}
              onDragOver={(e) => handleSlotDragOver(i, e)}
              onDragLeave={handleSlotDragLeave}
              onDrop={(e) => handleSlotDrop(i, e)}
              onDragEnd={handleSlotDragEnd}
              className={[
                "transition-transform",
                dragSourceSlot === i ? "opacity-40 scale-90" : "",
                dragOverSlot === i ? "scale-110" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ transition: "transform 100ms ease, opacity 100ms ease" }}
            >
              <ActionSlot
                variant="red"
                size="md"
                active={hasItem}
                disabled={hasItem && isEmpty}
                icon={def ? <ItemIcon iconId={def.icon} /> : <></>}
                onClick={hasItem ? () => handleUse(i) : undefined}
                keybind={displayKeyName(bindKeys[i])}
                quantity={hasItem ? qty : undefined}
                quantityPosition="top-right"
                cooldown={hasItem ? (snapshot.itemCooldowns.get(itemId) ?? null) : null}
                activationCount={activations[i]}
                tooltipName={def?.name}
                tooltipDesc={def?.description}
                tooltipDescParams={def?.effectParams}
                tooltipHint={def ? clickToUse : dragToAssign}
                rarity={def?.rarity}
              />
            </div>
          );
        })}
      </div>

      {/* Custom drag ghost — portal to body to escape parent transform */}
      {dragSourceSlot !== null &&
        dragItemDef &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[9999]"
            style={{ left: mousePos.x - 22, top: mousePos.y - 22 }}
          >
            <div className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-red-400/60 bg-slate-900/90 shadow-lg shadow-red-500/20">
              <span className="text-red-300">
                <ItemIcon iconId={dragItemDef.icon} />
              </span>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
