import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EQUIPMENT_SLOTS, INVENTORY_MAX_SLOTS } from "@dungeon/shared";
import type { EquipmentSlotValue, ItemDefClient } from "@dungeon/shared";
import { lobbyInventoryStore } from "../stores/lobbyInventoryStore";
import { authStore } from "../stores/authStore";
import { ItemSlotView } from "../components/ItemSlotView";
import { ItemIcon } from "../components/ItemIcon";
import { getRarityStyle } from "../utils/rarityColors";
import { CoinIcon } from "../icons/CoinIcon";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { playUiSfx } from "../../audio/uiSfx";
import { EMPTY_DRAG_IMG } from "../utils/dragGhost";

const EQUIP_GRID: { key: EquipmentSlotValue; labelKey: string; row: number; col: number }[] = [
  { key: EQUIPMENT_SLOTS.HEAD, labelKey: "equipment.head", row: 0, col: 1 },
  { key: EQUIPMENT_SLOTS.WEAPON, labelKey: "equipment.weapon", row: 1, col: 0 },
  { key: EQUIPMENT_SLOTS.CHEST, labelKey: "equipment.chest", row: 1, col: 1 },
  { key: EQUIPMENT_SLOTS.BOOTS, labelKey: "equipment.boots", row: 2, col: 1 },
  { key: EQUIPMENT_SLOTS.ACCESSORY_1, labelKey: "equipment.accessory", row: 1, col: 2 },
  { key: EQUIPMENT_SLOTS.ACCESSORY_2, labelKey: "equipment.accessory", row: 2, col: 2 },
];

const COLS = 6;

export const LobbyInventoryTab = (): ReactNode => {
  const { t } = useTranslation();
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const snap = useSyncExternalStore(lobbyInventoryStore.subscribe, lobbyInventoryStore.getSnapshot);
  const [pendingDestroy, setPendingDestroy] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ slotIndex: number; x: number; y: number } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const [dragSource, setDragSource] = useState<{ type: "inv"; index: number } | null>(null);
  const [dragOver, setDragOver] = useState<{ type: "inv" | "equip"; key: string } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const characterId = auth.characterId;

  useEffect(() => {
    if (characterId) lobbyInventoryStore.load(characterId);
  }, [characterId]);

  // Close context menu on click outside
  useEffect(() => {
    if (!ctxMenu) return;
    const handle = (e: PointerEvent) => {
      if (
        ctxMenuRef.current &&
        e.target instanceof Node &&
        !ctxMenuRef.current.contains(e.target)
      ) {
        setCtxMenu(null);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCtxMenu(null);
    };
    const frame = requestAnimationFrame(() => {
      document.addEventListener("pointerdown", handle, true);
      document.addEventListener("keydown", handleKey, true);
    });
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handle, true);
      document.removeEventListener("keydown", handleKey, true);
    };
  }, [ctxMenu]);

  const defMap = useMemo(() => {
    const m = new Map<string, ItemDefClient>();
    for (const d of snap.itemDefs) m.set(d.id, d);
    return m;
  }, [snap.itemDefs]);

  const instanceMap = useMemo(() => {
    const m = new Map<
      string,
      { id: string; itemId: string; rolledStats: Record<string, number>; itemLevel: number }
    >();
    for (const i of snap.instances) m.set(i.id, i);
    return m;
  }, [snap.instances]);

  // Clean up drag state
  const handleDragEnd = useCallback(() => {
    setDragSource(null);
    setDragOver(null);
  }, []);

  // Track mouse during drag + cleanup
  useEffect(() => {
    if (!dragSource) return;
    const onDragEnd = () => {
      setDragSource(null);
      setDragOver(null);
    };
    const onDragOver = (e: DragEvent) => {
      if (e.clientX === 0 && e.clientY === 0) return;
      setMousePos({ x: e.clientX, y: e.clientY });
    };
    document.addEventListener("dragend", onDragEnd);
    document.addEventListener("dragover", onDragOver);
    return () => {
      document.removeEventListener("dragend", onDragEnd);
      document.removeEventListener("dragover", onDragOver);
    };
  }, [dragSource]);

  if (snap.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
      </div>
    );
  }

  if (snap.error) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-red-400">{snap.error}</p>
      </div>
    );
  }

  const slots = Array.from({ length: INVENTORY_MAX_SLOTS }, (_, i) => {
    return snap.inventory.find((s) => s.slotIndex === i) ?? null;
  });

  const handleEquip = (slotIndex: number, itemId: string, targetSlotOverride?: string) => {
    if (!characterId) return;
    const def = defMap.get(itemId);
    if (!def?.equipSlot) return;
    let targetSlot = targetSlotOverride ?? (def.equipSlot as string);
    if (!targetSlotOverride && targetSlot.startsWith("accessory")) {
      const acc1 = snap.equipment.find((e) => e.slot === EQUIPMENT_SLOTS.ACCESSORY_1);
      const acc2 = snap.equipment.find((e) => e.slot === EQUIPMENT_SLOTS.ACCESSORY_2);
      targetSlot = !acc1
        ? EQUIPMENT_SLOTS.ACCESSORY_1
        : !acc2
          ? EQUIPMENT_SLOTS.ACCESSORY_2
          : EQUIPMENT_SLOTS.ACCESSORY_1;
    }
    playUiSfx("ui_equip");
    lobbyInventoryStore.equip(characterId, slotIndex, targetSlot);
  };

  const handleUnequip = (equipSlot: string) => {
    if (!characterId) return;
    playUiSfx("ui_click");
    lobbyInventoryStore.unequip(characterId, equipSlot);
  };

  const handleSwap = (from: number, to: number) => {
    if (!characterId || from === to) return;
    playUiSfx("ui_click");
    lobbyInventoryStore.swap(characterId, from, to);
  };

  const handleDestroy = () => {
    if (pendingDestroy === null || !characterId) return;
    playUiSfx("ui_click");
    lobbyInventoryStore.destroy(characterId, pendingDestroy);
    setPendingDestroy(null);
  };

  // Drag from inventory
  const onInvDragStart = (e: React.DragEvent, index: number) => {
    setDragSource({ type: "inv", index });
    setMousePos({ x: e.clientX, y: e.clientY });
    e.dataTransfer.effectAllowed = "move";
    if (EMPTY_DRAG_IMG) e.dataTransfer.setDragImage(EMPTY_DRAG_IMG, 0, 0);
  };

  const onInvDrop = (e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    setDragOver(null);
    if (dragSource?.type === "inv") handleSwap(dragSource.index, toIndex);
    setDragSource(null);
  };

  const onEquipDrop = (e: React.DragEvent, equipSlot: string) => {
    e.preventDefault();
    setDragOver(null);
    if (!dragSource || dragSource.type !== "inv") {
      setDragSource(null);
      return;
    }
    const slot = slots[dragSource.index];
    if (!slot) {
      setDragSource(null);
      return;
    }
    const def = defMap.get(slot.itemId);
    if (!def?.equipSlot) {
      setDragSource(null);
      return;
    }
    const matches =
      def.equipSlot === equipSlot ||
      (def.equipSlot.startsWith("accessory") && equipSlot.startsWith("accessory"));
    if (matches) handleEquip(dragSource.index, slot.itemId, equipSlot);
    setDragSource(null);
  };

  const isHighlighted = (type: "inv" | "equip", key: string) =>
    dragOver?.type === type && dragOver.key === key;

  // Check if an equip slot can accept the current drag source
  const canSlotAcceptDrag = (slotKey: string): boolean => {
    if (!dragSource || dragSource.type !== "inv") return false;
    const srcSlot = slots[dragSource.index];
    const srcDef = srcSlot ? defMap.get(srcSlot.itemId) : undefined;
    if (!srcDef?.equipSlot) return false;
    return (
      srcDef.equipSlot === slotKey ||
      (srcDef.equipSlot.startsWith("accessory") && slotKey.startsWith("accessory"))
    );
  };

  return (
    <div className="flex h-full gap-5 px-6 py-5">
      {/* ── Left: Equipment ── */}
      <div className="flex shrink-0 flex-col">
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-amber-500/15 bg-amber-950/20 px-3 py-2">
          <CoinIcon className="h-5 w-5 text-amber-400" />
          <span className="text-base font-bold text-amber-400">{snap.gold.toLocaleString()}</span>
        </div>

        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          {t("character.tabEquipment")}
        </div>

        <div
          className="grid grid-cols-3 gap-1.5"
          style={{ gridTemplateColumns: "repeat(3, 52px)" }}
        >
          {Array.from({ length: 9 }, (_, i) => {
            const row = Math.floor(i / 3);
            const col = i % 3;
            const slotConfig = EQUIP_GRID.find((s) => s.row === row && s.col === col);
            if (!slotConfig) return <div key={i} className="h-[52px] w-[52px]" />;

            const equip = snap.equipment.find((e) => e.slot === slotConfig.key);
            const instance = equip ? instanceMap.get(equip.instanceId) : undefined;
            const def = instance ? defMap.get(instance.itemId) : undefined;
            const canAccept = canSlotAcceptDrag(slotConfig.key);

            return (
              <ItemSlotView
                key={slotConfig.key}
                def={def}
                instance={instance}
                emptyLabel={t(slotConfig.labelKey)}
                highlighted={isHighlighted("equip", slotConfig.key) && canAccept}
                dashed={!def}
                showTooltip={!dragSource}
                tooltipExtra={
                  <div className="mt-1 text-[8px] text-slate-500">
                    {t("equipment.clickToUnequip")}
                  </div>
                }
                onClick={instance ? () => handleUnequip(slotConfig.key) : undefined}
                onDragOver={
                  canAccept
                    ? (e) => {
                        e.preventDefault();
                        setDragOver({ type: "equip", key: slotConfig.key });
                      }
                    : undefined
                }
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onEquipDrop(e, slotConfig.key)}
                dataDropZone="equipment"
                className={
                  canAccept && dragSource && !isHighlighted("equip", slotConfig.key)
                    ? "border-amber-500/30 !border-dashed bg-amber-950/10"
                    : ""
                }
              />
            );
          })}
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="w-px self-stretch bg-slate-700/30" />

      {/* ── Right: Inventory grid ── */}
      <div className="flex flex-1 flex-col">
        <div className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-500">
          {t("lobby.tabInventory")}
        </div>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${COLS}, 52px)` }}>
          {slots.map((slot, i) => {
            if (!slot) {
              return (
                <ItemSlotView
                  key={i}
                  highlighted={isHighlighted("inv", String(i))}
                  dashed
                  onDragOver={
                    dragSource
                      ? (e) => {
                          e.preventDefault();
                          setDragOver({ type: "inv", key: String(i) });
                        }
                      : undefined
                  }
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => onInvDrop(e, i)}
                />
              );
            }

            const def = defMap.get(slot.itemId);
            const instance = slot.instanceId ? instanceMap.get(slot.instanceId) : undefined;
            const isDragSource = dragSource?.type === "inv" && dragSource.index === i;

            // Find equipped item in the same slot for Shift comparison
            let compareInst: typeof instance = undefined;
            if (def?.equipSlot && instance) {
              const matchSlots = def.equipSlot.startsWith("accessory")
                ? [EQUIPMENT_SLOTS.ACCESSORY_1, EQUIPMENT_SLOTS.ACCESSORY_2]
                : [def.equipSlot];
              for (const s of matchSlots) {
                const eq = snap.equipment.find((e) => e.slot === s);
                if (eq) {
                  compareInst = instanceMap.get(eq.instanceId);
                  break;
                }
              }
            }

            return (
              <ItemSlotView
                key={i}
                def={def}
                instance={instance}
                compareInstance={compareInst}
                quantity={slot.quantity}
                highlighted={isHighlighted("inv", String(i))}
                dimmed={isDragSource}
                showTooltip={!dragSource}
                tooltipExtra={
                  <div className="mt-0.5 text-[8px] text-slate-600">
                    {t("inventory.rightClickMenu")}
                  </div>
                }
                draggable
                onDragStart={(e) => onInvDragStart(e, i)}
                onDragEnd={handleDragEnd}
                onDragOver={
                  dragSource
                    ? (e) => {
                        e.preventDefault();
                        setDragOver({ type: "inv", key: String(i) });
                      }
                    : undefined
                }
                onDragLeave={() => setDragOver(null)}
                onDrop={(e) => onInvDrop(e, i)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  playUiSfx("ui_click");
                  setCtxMenu({ slotIndex: slot.slotIndex, x: e.clientX, y: e.clientY });
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Context menu */}
      {ctxMenu &&
        (() => {
          const ctxSlot = slots.find((s) => s?.slotIndex === ctxMenu.slotIndex) ?? null;
          if (!ctxSlot) return null;
          const ctxDef = defMap.get(ctxSlot.itemId);
          const ctxIsEquipment = !!ctxDef?.equipSlot;
          const rarityStyle = ctxDef ? getRarityStyle(ctxDef.rarity) : null;
          return createPortal(
            <div
              ref={ctxMenuRef}
              className="pointer-events-auto fixed z-[9998] min-w-[140px] rounded-lg border border-slate-600/50 bg-slate-900/95 py-1 shadow-xl backdrop-blur-sm"
              style={{ left: ctxMenu.x, top: ctxMenu.y }}
            >
              <div
                className={`px-3 py-1.5 text-[11px] font-semibold border-b border-slate-700/30 ${rarityStyle?.text ?? "text-slate-200"}`}
              >
                {ctxDef ? t(ctxDef.name) : ctxSlot.itemId}
              </div>
              {ctxIsEquipment && (
                <button
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-slate-300 hover:bg-slate-700/50 transition-colors"
                  onClick={() => {
                    handleEquip(ctxMenu.slotIndex, ctxSlot.itemId);
                    setCtxMenu(null);
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-3 w-3 text-amber-400"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      fillRule="evenodd"
                      d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t("equipment.equip")}
                </button>
              )}
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-red-400 hover:bg-red-900/20 transition-colors"
                onClick={() => {
                  setPendingDestroy(ctxMenu.slotIndex);
                  setCtxMenu(null);
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                {t("inventory.destroy")}
              </button>
            </div>,
            document.body,
          );
        })()}

      {/* Drag ghost */}
      {dragSource?.type === "inv" &&
        (() => {
          const srcSlot = slots[dragSource.index];
          if (!srcSlot) return null;
          const srcDef = defMap.get(srcSlot.itemId);
          const rarityStyle = srcDef ? getRarityStyle(srcDef.rarity) : null;
          return createPortal(
            <div
              className="pointer-events-none fixed z-[9999]"
              style={{ left: mousePos.x - 22, top: mousePos.y - 22 }}
            >
              <div
                className={`relative flex h-11 w-11 items-center justify-center rounded-lg border bg-slate-900/90 shadow-lg ${
                  rarityStyle?.border ?? "border-sky-400/60"
                } shadow-sky-500/20`}
              >
                {srcDef ? (
                  <ItemIcon iconId={srcDef.icon} />
                ) : (
                  <span className="text-[14px] text-sky-300">?</span>
                )}
                {srcSlot.quantity >= 2 && (
                  <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded bg-slate-900/90 px-0.5 text-[9px] font-bold text-slate-300 ring-1 ring-slate-600/50">
                    {srcSlot.quantity}
                  </span>
                )}
              </div>
            </div>,
            document.body,
          );
        })()}

      {/* Destroy confirmation */}
      {pendingDestroy !== null && (
        <ConfirmDialog
          title={t("inventory.destroyTitle")}
          message={t("inventory.destroyMessage")}
          confirmLabel={t("inventory.destroyConfirm")}
          cancelLabel={t("inventory.destroyCancel")}
          onConfirm={handleDestroy}
          onCancel={() => setPendingDestroy(null)}
        />
      )}
    </div>
  );
};
