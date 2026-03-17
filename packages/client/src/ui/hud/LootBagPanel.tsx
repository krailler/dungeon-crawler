import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { lootBagStore } from "../stores/lootBagStore";
import { itemDefStore } from "../stores/itemDefStore";
import { HudPanel } from "../components/HudPanel";
import { ActionSlot } from "../components/ActionSlot";
import { PotionIcon } from "../icons/PotionIcon";
import { playUiSfx } from "../../audio/uiSfx";

const ITEM_ICON_MAP: Record<string, (props: { className?: string }) => ReactNode> = {
  potion_red: PotionIcon,
};

export const LootBagPanel = (): ReactNode => {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(lootBagStore.subscribe, lootBagStore.getSnapshot);
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);

  const handleClose = useCallback(() => lootBagStore.close(), []);

  const handleTake = useCallback((slotIndex: number) => {
    playUiSfx("ui_click");
    lootBagStore.take(slotIndex);
  }, []);

  if (!snap.lootBagId || snap.slots.length === 0) return null;

  const clickToTake = t("loot.take");

  return (
    <HudPanel
      header={<h3 className="text-sm font-bold text-slate-100">{t("loot.title")}</h3>}
      onClose={handleClose}
      panelId="loot"
      defaultPosition={{ x: window.innerWidth / 2 - 100, y: window.innerHeight / 3 }}
      persistPosition={false}
      className="w-[200px]"
    >
      <div className="grid grid-cols-4 gap-1.5">
        {snap.slots.map((slot, i) => {
          const def = slot ? itemDefs.get(slot.itemId) : undefined;
          const IconComponent = def ? ITEM_ICON_MAP[def.icon] : undefined;

          return (
            <ActionSlot
              key={i}
              variant="empty"
              size="sm"
              active={!!slot}
              icon={
                IconComponent ? (
                  <IconComponent />
                ) : slot ? (
                  <span className="text-[14px]">?</span>
                ) : (
                  <></>
                )
              }
              onClick={slot ? () => handleTake(i) : undefined}
              quantity={slot?.quantity}
              quantityMin={2}
              quantityPosition="bottom-right"
              tooltipName={def?.name}
              tooltipDesc={def?.description}
              tooltipDescParams={def?.effectParams}
              tooltipHint={slot ? clickToTake : undefined}
            />
          );
        })}
      </div>
    </HudPanel>
  );
};
