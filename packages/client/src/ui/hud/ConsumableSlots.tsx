import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "../stores/hudStore";
import { itemDefStore } from "../stores/itemDefStore";
import { PotionIcon } from "../icons/PotionIcon";
import { ActionSlot } from "../components/ActionSlot";

// ── Icon map (item icon name → component) ────────────────────────────────────

const ITEM_ICON_MAP: Record<string, (props: { className?: string }) => JSX.Element> = {
  potion_red: PotionIcon,
};

// ── Aggregated consumable (unique item from inventory with total qty) ────────

type ConsumableEntry = {
  itemId: string;
  icon: string;
  name: string;
  totalQty: number;
};

// ── ConsumableSlots ──────────────────────────────────────────────────────────

export const ConsumableSlots = (): JSX.Element => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);
  const localMember = useMemo(() => snapshot.members.find((m) => m.isLocal), [snapshot.members]);
  const inventory = localMember?.inventory;

  // Aggregate consumables from inventory
  const consumables = useMemo((): ConsumableEntry[] => {
    if (!inventory || itemDefs.size === 0) return [];
    const map = new Map<string, ConsumableEntry>();
    for (const slot of inventory) {
      const def = itemDefs.get(slot.itemId);
      if (!def || !def.consumable) continue;
      const existing = map.get(slot.itemId);
      if (existing) {
        existing.totalQty += slot.quantity;
      } else {
        map.set(slot.itemId, {
          itemId: slot.itemId,
          icon: def.icon,
          name: def.name,
          totalQty: slot.quantity,
        });
      }
    }
    return Array.from(map.values());
  }, [inventory, itemDefs]);

  const handleUse = useCallback((itemId: string) => {
    hudStore.useItem(itemId);
  }, []);

  // Keyboard shortcut: Q uses first consumable
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === "q" && consumables.length > 0) {
        handleUse(consumables[0].itemId);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [consumables, handleUse]);

  // Always show at least the first consumable slot (health potion = Q)
  const firstEntry = consumables[0] ?? null;
  const hasPotion = firstEntry !== null;

  return (
    <div className="flex items-center gap-1.5">
      {/* Fixed potion slot (Q) — always visible */}
      <ActionSlot
        variant="red"
        size="md"
        active={hasPotion}
        icon={
          <span className={hasPotion ? "text-rose-300" : "text-slate-600"}>
            <PotionIcon className="h-6 w-6" />
          </span>
        }
        onClick={hasPotion ? () => handleUse(firstEntry.itemId) : undefined}
        keybind="Q"
        quantity={hasPotion ? firstEntry.totalQty : undefined}
        quantityPosition="top-right"
        cooldown={hasPotion ? (snapshot.itemCooldowns.get(firstEntry.itemId) ?? null) : null}
        tooltip={
          hasPotion ? (
            <div className="text-[11px] font-semibold text-slate-100">{t(firstEntry.name)}</div>
          ) : undefined
        }
      />

      {/* Extra consumable slots (if more than one type) */}
      {consumables.slice(1).map((entry, i) => {
        const IconComponent = ITEM_ICON_MAP[entry.icon];
        return (
          <ActionSlot
            key={entry.itemId}
            variant="red"
            size="md"
            active
            icon={
              IconComponent ? (
                <span className="text-rose-300">
                  <IconComponent className="h-6 w-6" />
                </span>
              ) : (
                <span className="text-[16px]">?</span>
              )
            }
            onClick={() => handleUse(entry.itemId)}
            keybind={String(i + 2)}
            quantity={entry.totalQty}
            quantityPosition="top-right"
            cooldown={snapshot.itemCooldowns.get(entry.itemId) ?? null}
            tooltip={
              <div className="text-[11px] font-semibold text-slate-100">{t(entry.name)}</div>
            }
          />
        );
      })}
    </div>
  );
};
