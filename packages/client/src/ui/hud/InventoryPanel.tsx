import { useMemo, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { INVENTORY_MAX_SLOTS } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import { itemDefStore } from "../stores/itemDefStore";
import { PotionIcon } from "../icons/PotionIcon";
import { ActionSlot } from "../components/ActionSlot";
import { HudPanel } from "../components/HudPanel";
import { playUiSfx } from "../../audio/uiSfx";

// ── Icon map ─────────────────────────────────────────────────────────────────

const ITEM_ICON_MAP: Record<string, (props: { className?: string }) => JSX.Element> = {
  potion_red: PotionIcon,
};

// ── Inventory tooltip ────────────────────────────────────────────────────────

const InventoryTooltip = ({
  name,
  description,
  descriptionParams,
  consumable,
}: {
  name: string;
  description: string;
  descriptionParams?: Record<string, unknown>;
  consumable: boolean;
}): JSX.Element => {
  const { t } = useTranslation();
  return (
    <>
      <div className="text-[11px] font-semibold text-slate-100">{t(name)}</div>
      <div className="mt-0.5 text-[10px] text-slate-400">{t(description, descriptionParams)}</div>
      {consumable && (
        <div className="mt-1 text-[10px] text-emerald-400/80">{t("inventory.clickToUse")}</div>
      )}
    </>
  );
};

// ── InventoryPanel ───────────────────────────────────────────────────────────

export const InventoryPanel = ({ onClose }: { onClose: () => void }): JSX.Element | null => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);
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

  const handleUse = (itemId: string): void => {
    const def = itemDefs.get(itemId);
    if (!def?.consumable) return;
    playUiSfx("ui_click");
    hudStore.useItem(itemId);
  };

  return (
    <HudPanel
      onClose={onClose}
      header={<h3 className="text-sm font-bold text-slate-100">{t("inventory.title")}</h3>}
      className="absolute bottom-16 right-5 w-[220px]"
    >
      <div className="grid grid-cols-4 gap-1.5">
        {slots.map((slot, i) => {
          const def = slot ? itemDefs.get(slot.itemId) : undefined;
          const IconComponent = def ? ITEM_ICON_MAP[def.icon] : undefined;
          const isConsumable = def?.consumable;

          return (
            <ActionSlot
              key={i}
              variant="empty"
              size="sm"
              active={!!slot}
              icon={
                IconComponent ? (
                  <span className="text-rose-300">
                    <IconComponent className="h-5 w-5" />
                  </span>
                ) : slot ? (
                  <span className="text-[14px] text-slate-400">?</span>
                ) : (
                  <></>
                )
              }
              onClick={slot && isConsumable ? () => handleUse(slot.itemId) : undefined}
              quantity={slot?.quantity}
              quantityMin={2}
              quantityPosition="bottom-right"
              cooldown={slot ? (snapshot.itemCooldowns.get(slot.itemId) ?? null) : null}
              tooltip={
                def ? (
                  <InventoryTooltip
                    name={def.name}
                    description={def.description}
                    descriptionParams={def.effectParams}
                    consumable={!!isConsumable}
                  />
                ) : undefined
              }
            />
          );
        })}
      </div>
    </HudPanel>
  );
};
