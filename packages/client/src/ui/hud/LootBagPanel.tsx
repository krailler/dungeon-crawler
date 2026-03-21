import { useCallback, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { lootBagStore } from "../stores/lootBagStore";
import { hudStore } from "../stores/hudStore";
import { itemDefStore } from "../stores/itemDefStore";
import { HudPanel } from "../components/HudPanel";
import { ItemActionSlot } from "../components/ItemActionSlot";
import { playUiSfx } from "../../audio/uiSfx";

export const LootBagPanel = (): ReactNode => {
  const { t } = useTranslation();
  const snap = useSyncExternalStore(lootBagStore.subscribe, lootBagStore.getSnapshot);
  const hudSnap = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);

  const equipment = useMemo(() => {
    const local = hudSnap.members.find((m) => m.isLocal);
    return local?.equipment ?? {};
  }, [hudSnap.members]);

  const getCompareInstanceId = useCallback(
    (slot: { itemId: string; instanceId?: string } | null): string | undefined => {
      if (!slot?.instanceId) return undefined;
      const def = itemDefs.get(slot.itemId);
      if (!def?.equipSlot) return undefined;
      if (def.equipSlot.startsWith("accessory")) {
        return equipment["accessory_1"]?.instanceId ?? equipment["accessory_2"]?.instanceId;
      }
      return equipment[def.equipSlot]?.instanceId;
    },
    [itemDefs, equipment],
  );

  const handleClose = useCallback(() => lootBagStore.close(), []);

  const handleTake = useCallback((slotIndex: number) => {
    playUiSfx("ui_click");
    lootBagStore.take(slotIndex);
  }, []);

  if (!snap.lootBagId || snap.slots.length === 0) return null;

  return (
    <HudPanel
      header={<h3 className="text-sm font-bold text-slate-100">{t("loot.title")}</h3>}
      onClose={handleClose}
      panelId="loot"
      defaultPosition={{ x: window.innerWidth / 2 - 100, y: window.innerHeight / 3 }}
      persistPosition={false}
      className="w-[220px]"
    >
      <div className="grid grid-cols-4 gap-1.5">
        {snap.slots.map((slot, i) => (
          <ItemActionSlot
            key={i}
            itemId={slot?.itemId}
            instanceId={slot?.instanceId}
            quantity={slot?.quantity}
            hint={slot ? t("loot.take") : undefined}
            onClick={slot ? () => handleTake(i) : undefined}
            compareInstanceId={getCompareInstanceId(slot)}
          />
        ))}
      </div>
    </HudPanel>
  );
};
