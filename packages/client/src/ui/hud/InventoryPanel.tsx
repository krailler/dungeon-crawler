import {
  memo,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
  useSyncExternalStore,
} from "react";
import type { ReactNode, DragEvent } from "react";
import { useTranslation } from "react-i18next";
import { INVENTORY_MAX_SLOTS } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import type { SkillCooldownState } from "../stores/hudStore";
import { itemDefStore } from "../stores/itemDefStore";
import { ActionSlot } from "../components/ActionSlot";
import { HudPanel } from "../components/HudPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { feedbackStore } from "../stores/feedbackStore";
import { playUiSfx } from "../../audio/uiSfx";
import { ItemIcon } from "../components/ItemIcon";
import { EMPTY_DRAG_IMG } from "../utils/dragGhost";

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
  onDrop: (index: number, shiftKey: boolean) => void;
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
        if (EMPTY_DRAG_IMG) {
          e.dataTransfer.setDragImage(EMPTY_DRAG_IMG, 0, 0);
        }
        e.dataTransfer.effectAllowed = "move";
        // Allow dropping onto consumable bar if the item is consumable and not transient
        if (def?.consumable && !def.transient) {
          e.dataTransfer.setData("application/x-consumable-item", slot.itemId);
        }
        onDragStart(index);
      },
      [slot, def, index, onDragStart],
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
        onDrop(index, e.shiftKey);
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

// ── SplitDialog ─────────────────────────────────────────────────────────────

const SplitDialog = ({
  max,
  value,
  onChange,
  onConfirm,
  onCancel,
}: {
  max: number;
  value: number;
  onChange: (v: number) => void;
  onConfirm: () => void;
  onCancel: () => void;
}): ReactNode => {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.stopImmediatePropagation();
        onConfirm();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onConfirm, onCancel]);

  return (
    <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center rounded-2xl bg-black/60 backdrop-blur-sm">
      <div className="w-44 p-3">
        <h2 className="mb-2.5 text-center text-sm font-bold text-amber-400">
          {t("inventory.splitTitle")}
        </h2>
        {/* Number input with +/- buttons */}
        <div className="mb-2 flex items-center justify-center gap-1.5">
          <button
            onClick={() => onChange(Math.max(1, value - 1))}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-600/40 bg-slate-800/80 text-xs text-slate-300 hover:bg-slate-600/60 hover:text-white"
          >
            -
          </button>
          <input
            ref={inputRef}
            type="number"
            min={1}
            max={max}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n >= 1 && n <= max) onChange(n);
            }}
            className="w-12 rounded border border-slate-600/40 bg-slate-800/80 px-1 py-0.5 text-center text-sm font-bold text-amber-300 outline-none focus:border-amber-500/50 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          <button
            onClick={() => onChange(Math.min(max, value + 1))}
            className="flex h-6 w-6 items-center justify-center rounded border border-slate-600/40 bg-slate-800/80 text-xs text-slate-300 hover:bg-slate-600/60 hover:text-white"
          >
            +
          </button>
        </div>
        {/* Slider */}
        <input
          type="range"
          min={1}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="mb-2.5 w-full accent-amber-500"
        />
        {/* Buttons */}
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded bg-slate-700/60 px-2 py-1 text-xs text-slate-300 hover:bg-slate-600/60"
          >
            {t("inventory.destroyCancel")}
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 rounded bg-amber-600/80 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-500/80"
          >
            {t("inventory.splitConfirm")}
          </button>
        </div>
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

  // Track whether the drop landed on a valid target
  const dropHandledRef = useRef(false);
  const dragSourceRef = useRef<number | null>(null);
  dragSourceRef.current = dragSourceIndex;

  // Pending destroy confirmation
  const [pendingDestroySlot, setPendingDestroySlot] = useState<number | null>(null);

  // Pending split state
  const [pendingSplit, setPendingSplit] = useState<{
    from: number;
    to: number;
    max: number;
  } | null>(null);
  const [splitAmount, setSplitAmount] = useState(1);

  // Track mouse globally + accept drops anywhere to avoid snap-back animation
  useEffect(() => {
    if (dragSourceIndex === null) return;
    const onDragOver = (e: globalThis.DragEvent): void => {
      e.preventDefault();
      if (e.clientX === 0 && e.clientY === 0) return;
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    const onDrop = (e: globalThis.DragEvent): void => {
      e.preventDefault();
      // If no slot handled the drop, ask to destroy (skip transient items)
      if (!dropHandledRef.current && dragSourceRef.current !== null) {
        const srcSlot = slots[dragSourceRef.current];
        const srcDef = srcSlot ? itemDefStore.getSnapshot().get(srcSlot.itemId) : undefined;
        if (srcSlot && srcDef?.transient) {
          feedbackStore.push("inventory.cannotDestroy");
        } else if (srcSlot) {
          setPendingDestroySlot(dragSourceRef.current);
        }
      }
      setDragSourceIndex(null);
      setDragOverIndex(null);
    };
    document.addEventListener("dragover", onDragOver);
    document.addEventListener("drop", onDrop);
    return () => {
      document.removeEventListener("dragover", onDragOver);
      document.removeEventListener("drop", onDrop);
    };
  }, [dragSourceIndex]);

  const handleDragStart = useCallback((index: number) => {
    dropHandledRef.current = false;
    setDragSourceIndex(index);
  }, []);

  const handleDragOver = useCallback((index: number) => {
    setDragOverIndex(index);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback(
    (toIndex: number, shiftKey: boolean) => {
      dropHandledRef.current = true;
      if (dragSourceIndex !== null && dragSourceIndex !== toIndex) {
        const srcSlot = slots[dragSourceIndex];
        const dstSlot = slots[toIndex];
        // Shift+drop on empty or same-item slot with qty > 1 → split
        if (
          shiftKey &&
          srcSlot &&
          srcSlot.quantity > 1 &&
          (!dstSlot || dstSlot.itemId === srcSlot.itemId)
        ) {
          setSplitAmount(1);
          setPendingSplit({ from: dragSourceIndex, to: toIndex, max: srcSlot.quantity - 1 });
        } else {
          playUiSfx("ui_click");
          hudStore.swapInventorySlots(dragSourceIndex, toIndex);
        }
      }
      setDragSourceIndex(null);
      setDragOverIndex(null);
    },
    [dragSourceIndex, slots],
  );

  const handleDragEnd = useCallback(() => {
    setDragSourceIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleConfirmDestroy = useCallback(() => {
    if (pendingDestroySlot !== null) {
      playUiSfx("ui_click");
      hudStore.destroyInventorySlot(pendingDestroySlot);
    }
    setPendingDestroySlot(null);
  }, [pendingDestroySlot]);

  const handleCancelDestroy = useCallback(() => {
    setPendingDestroySlot(null);
  }, []);

  const handleConfirmSplit = useCallback(() => {
    if (pendingSplit && splitAmount > 0 && splitAmount <= pendingSplit.max) {
      playUiSfx("ui_click");
      hudStore.splitInventorySlot(pendingSplit.from, pendingSplit.to, splitAmount);
    }
    setPendingSplit(null);
  }, [pendingSplit, splitAmount]);

  const handleCancelSplit = useCallback(() => {
    setPendingSplit(null);
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
        <div ref={panelRef} className="grid grid-cols-4 gap-1.5">
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
        {pendingDestroySlot !== null && (
          <ConfirmDialog
            variant="inline"
            title={t("inventory.destroyTitle")}
            message={t("inventory.destroyMessage")}
            confirmLabel={t("inventory.destroyConfirm")}
            cancelLabel={t("inventory.destroyCancel")}
            onConfirm={handleConfirmDestroy}
            onCancel={handleCancelDestroy}
          />
        )}
        {pendingSplit !== null && (
          <SplitDialog
            max={pendingSplit.max}
            value={splitAmount}
            onChange={setSplitAmount}
            onConfirm={handleConfirmSplit}
            onCancel={handleCancelSplit}
          />
        )}
      </HudPanel>

      {/* Custom drag ghost — follows cursor */}
      {dragSlot && dragSourceIndex !== null && <DragGhost slot={dragSlot} mousePos={mousePos} />}
    </>
  );
};
