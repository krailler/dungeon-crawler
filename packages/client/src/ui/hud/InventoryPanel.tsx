import { memo, useMemo, useState, useCallback, useRef, useSyncExternalStore } from "react";
import type { ReactNode, DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { INVENTORY_MAX_SLOTS } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import type { SkillCooldownState } from "../stores/hudStore";
import { itemDefStore } from "../stores/itemDefStore";
import { ActionSlot } from "../components/ActionSlot";
import { HudPanel } from "../components/HudPanel";
import { playUiSfx } from "../../audio/uiSfx";
import { ItemIcon } from "../components/ItemIcon";

// ── Drag ghost ───────────────────────────────────────────────────────────────

/** Invisible 1x1 image used to hide the default browser drag ghost */
const EMPTY_IMG = (() => {
  if (typeof document === "undefined") return null;
  const img = new Image();
  img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=";
  return img;
})();

// ── InventorySlot ────────────────────────────────────────────────────────────

type InventorySlotProps = {
  index: number;
  slot: { itemId: string; quantity: number } | null;
  isDragSource: boolean;
  isDragOver: boolean;
  cooldown: SkillCooldownState | null;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDragLeave: () => void;
  onDrop: (index: number) => void;
  onDragEnd: () => void;
  onContextMenu: (itemId: string) => void;
};

const InventorySlot = memo(
  ({
    index,
    slot,
    isDragSource,
    isDragOver,
    cooldown,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    onContextMenu,
  }: InventorySlotProps): ReactNode => {
    const { t } = useTranslation();
    const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);
    const def = slot ? itemDefs.get(slot.itemId) : undefined;
    const isConsumable = def?.consumable;

    const handleDragStart = useCallback(
      (e: DragEvent<HTMLDivElement>) => {
        if (!slot) {
          e.preventDefault();
          return;
        }
        // Hide default drag ghost
        if (EMPTY_IMG) {
          e.dataTransfer.setDragImage(EMPTY_IMG, 0, 0);
        }
        e.dataTransfer.effectAllowed = "move";
        onDragStart(index);
      },
      [slot, index, onDragStart],
    );

    const handleDragOver = useCallback(
      (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        onDragOver(index);
      },
      [index, onDragOver],
    );

    const handleDrop = useCallback(
      (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        onDrop(index);
      },
      [index, onDrop],
    );

    const handleContextMenu = useCallback(
      (e: React.MouseEvent) => {
        e.preventDefault();
        if (slot && isConsumable) {
          onContextMenu(slot.itemId);
        }
      },
      [slot, isConsumable, onContextMenu],
    );

    return (
      <div
        draggable={!!slot}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={onDragLeave}
        onDrop={handleDrop}
        onDragEnd={onDragEnd}
        onContextMenu={handleContextMenu}
        className={[
          "transition-transform",
          isDragSource ? "opacity-40 scale-90" : "",
          isDragOver ? "scale-110" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ transition: "transform 100ms ease, opacity 100ms ease" }}
      >
        <ActionSlot
          variant="empty"
          size="sm"
          active={!!slot}
          icon={
            def ? (
              <ItemIcon iconId={def.icon} />
            ) : slot ? (
              <span className="text-[14px]">?</span>
            ) : (
              <></>
            )
          }
          quantity={slot?.quantity}
          quantityMin={2}
          quantityPosition="bottom-right"
          cooldown={cooldown}
          tooltipName={def?.name}
          tooltipDesc={def?.description}
          tooltipDescParams={def?.effectParams}
          tooltipHint={isConsumable ? t("inventory.rightClickToUse") : undefined}
          rarity={def?.rarity}
        />
      </div>
    );
  },
);

// ── Drag ghost overlay ───────────────────────────────────────────────────────

const DragGhost = ({
  slot,
  mousePos,
}: {
  slot: { itemId: string; quantity: number };
  mousePos: { x: number; y: number };
}): ReactNode => {
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);
  const def = itemDefs.get(slot.itemId);

  return (
    <div
      className="pointer-events-none fixed z-[9999]"
      style={{
        left: mousePos.x - 22,
        top: mousePos.y - 22,
      }}
    >
      <div className="relative flex h-11 w-11 items-center justify-center rounded-lg border border-sky-400/60 bg-slate-900/90 shadow-lg shadow-sky-500/20">
        <span className="text-sky-300">
          {def ? <ItemIcon iconId={def.icon} /> : <span className="text-[14px]">?</span>}
        </span>
        {slot.quantity >= 2 && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded bg-slate-900/90 px-0.5 text-[9px] font-bold text-slate-300 ring-1 ring-slate-600/50">
            {slot.quantity}
          </span>
        )}
      </div>
    </div>
  );
};

// ── InventoryPanel ───────────────────────────────────────────────────────────

export const InventoryPanel = ({ onClose }: { onClose: () => void }): ReactNode => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = snapshot.members.find((m) => m.isLocal);
  const inventory = local?.inventory;

  // Build slot array: INVENTORY_MAX_SLOTS entries, each slot or null
  const slots = useMemo(() => {
    const result: ({ itemId: string; quantity: number } | null)[] = Array.from(
      { length: INVENTORY_MAX_SLOTS },
      () => null,
    );
    if (inventory) {
      for (const entry of inventory) {
        if (entry.slot >= 0 && entry.slot < INVENTORY_MAX_SLOTS) {
          result[entry.slot] = { itemId: entry.itemId, quantity: entry.quantity };
        }
      }
    }
    return result;
  }, [inventory]);

  // ── Drag state ──────────────────────────────────────────────────────────
  const [dragSourceIndex, setDragSourceIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  // Track mouse position for the custom drag ghost
  const handleDragOverPanel = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setMousePos({ x: e.clientX, y: e.clientY });
  }, []);

  const handleDragStart = useCallback((index: number) => {
    setDragSourceIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (toIndex: number) => {
      if (dragSourceIndex !== null && dragSourceIndex !== toIndex) {
        playUiSfx("ui_click");
        hudStore.swapInventorySlots(dragSourceIndex, toIndex);
      }
      setDragSourceIndex(null);
      setDragOverIndex(null);
    },
    [dragSourceIndex],
  );

  const handleDragEnd = useCallback(() => {
    setDragSourceIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleContextMenu = useCallback((itemId: string) => {
    playUiSfx("ui_click");
    hudStore.useItem(itemId);
  }, []);

  const dragSlot = dragSourceIndex !== null ? slots[dragSourceIndex] : null;

  return (
    <>
      <HudPanel
        onClose={onClose}
        header={<h3 className="text-sm font-bold text-slate-100">{t("inventory.title")}</h3>}
        panelId="inventory"
        defaultPosition={{ x: window.innerWidth - 240, y: window.innerHeight - 380 }}
        className="w-[220px]"
      >
        <div ref={panelRef} className="grid grid-cols-4 gap-1.5" onDragOver={handleDragOverPanel}>
          {slots.map((slot, i) => (
            <InventorySlot
              key={i}
              index={i}
              slot={slot}
              isDragSource={dragSourceIndex === i}
              isDragOver={dragOverIndex === i && dragSourceIndex !== i}
              cooldown={slot ? (snapshot.itemCooldowns.get(slot.itemId) ?? null) : null}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onDragEnd={handleDragEnd}
              onContextMenu={handleContextMenu}
            />
          ))}
        </div>
      </HudPanel>

      {/* Custom drag ghost — follows cursor */}
      {dragSlot && dragSourceIndex !== null && <DragGhost slot={dragSlot} mousePos={mousePos} />}
    </>
  );
};
