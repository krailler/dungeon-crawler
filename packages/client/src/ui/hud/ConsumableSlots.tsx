import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "../stores/hudStore";
import { itemDefStore } from "../stores/itemDefStore";
import { settingsStore, displayKeyName } from "../stores/settingsStore";
import { PotionIcon } from "../icons/PotionIcon";
import { ActionSlot } from "../components/ActionSlot";

// ── Icon map (item icon name → component) ────────────────────────────────────

const ITEM_ICON_MAP: Record<string, (props: { className?: string }) => ReactNode> = {
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

export const ConsumableSlots = (): ReactNode => {
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

  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);
  const consumableKey = settings.keybindings.consumable_1;

  // Keyboard shortcut: configurable key uses first consumable
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key.toLowerCase() === consumableKey.toLowerCase() && consumables.length > 0) {
        handleUse(consumables[0].itemId);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [consumables, handleUse, consumableKey]);

  // Always show at least the first consumable slot (health potion = Q)
  const firstEntry = consumables[0] ?? null;
  const hasPotion = firstEntry !== null;
  const firstDef = hasPotion ? itemDefs.get(firstEntry.itemId) : undefined;
  const clickToUse = t("inventory.clickToUse");

  return (
    <div className="flex items-center gap-1.5">
      {/* Fixed potion slot (Q) — always visible */}
      <ActionSlot
        variant="red"
        size="md"
        active={hasPotion}
        icon={<PotionIcon />}
        onClick={hasPotion ? () => handleUse(firstEntry.itemId) : undefined}
        keybind={displayKeyName(consumableKey)}
        quantity={hasPotion ? firstEntry.totalQty : undefined}
        quantityPosition="top-right"
        cooldown={hasPotion ? (snapshot.itemCooldowns.get(firstEntry.itemId) ?? null) : null}
        tooltipName={firstDef?.name}
        tooltipDesc={firstDef?.description}
        tooltipDescParams={firstDef?.effectParams}
        tooltipHint={firstDef ? clickToUse : undefined}
      />

      {/* Extra consumable slots (if more than one type) */}
      {consumables.slice(1).map((entry, i) => {
        const IconComponent = ITEM_ICON_MAP[entry.icon];
        const def = itemDefs.get(entry.itemId);
        return (
          <ActionSlot
            key={entry.itemId}
            variant="red"
            size="md"
            active
            icon={IconComponent ? <IconComponent /> : <span className="text-[16px]">?</span>}
            onClick={() => handleUse(entry.itemId)}
            keybind={String(i + 2)}
            quantity={entry.totalQty}
            quantityPosition="top-right"
            cooldown={snapshot.itemCooldowns.get(entry.itemId) ?? null}
            tooltipName={def?.name}
            tooltipDesc={def?.description}
            tooltipDescParams={def?.effectParams}
            tooltipHint={def ? clickToUse : undefined}
          />
        );
      })}
    </div>
  );
};
