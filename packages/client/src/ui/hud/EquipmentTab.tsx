import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { DragEvent, ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { EQUIPMENT_SLOTS } from "@dungeon/shared";
import type { EquipmentSlotValue } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import { ItemActionSlot } from "../components/ItemActionSlot";
import { itemInstanceStore } from "../stores/itemInstanceStore";

const EQUIP_MIME = "application/x-equip-slot";

type SlotConfig = {
  key: EquipmentSlotValue;
  labelKey: string;
};

const SLOT_LAYOUT: SlotConfig[] = [
  { key: EQUIPMENT_SLOTS.WEAPON, labelKey: "equipment.weapon" },
  { key: EQUIPMENT_SLOTS.HEAD, labelKey: "equipment.head" },
  { key: EQUIPMENT_SLOTS.CHEST, labelKey: "equipment.chest" },
  { key: EQUIPMENT_SLOTS.BOOTS, labelKey: "equipment.boots" },
  { key: EQUIPMENT_SLOTS.ACCESSORY_1, labelKey: "equipment.accessory1" },
  { key: EQUIPMENT_SLOTS.ACCESSORY_2, labelKey: "equipment.accessory2" },
];

function EquipmentSlotItem({
  slotConfig,
  instanceId,
}: {
  slotConfig: SlotConfig;
  instanceId: string | undefined;
}): ReactNode {
  const { t } = useTranslation();
  const instances = useSyncExternalStore(
    itemInstanceStore.subscribe,
    itemInstanceStore.getSnapshot,
  );
  const instance = instanceId ? instances.get(instanceId) : undefined;
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes(EQUIP_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    }
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(false), []);

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      setDragOver(false);
      const invSlot = e.dataTransfer.getData(EQUIP_MIME);
      if (!invSlot) return;
      hudStore.equipItem(Number(invSlot), slotConfig.key);
    },
    [slotConfig.key],
  );

  return (
    <div
      className={`flex flex-col items-center gap-0.5 rounded-lg transition-colors ${dragOver ? "bg-sky-500/20 ring-1 ring-sky-400/40" : ""}`}
      data-drop-zone
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <ItemActionSlot
        itemId={instance?.itemId}
        instanceId={instanceId}
        hint={t("equipment.clickToUnequip")}
        onClick={instanceId ? () => hudStore.unequipItem(slotConfig.key) : undefined}
      />
      <span className="text-[9px] text-slate-500">{t(slotConfig.labelKey)}</span>
    </div>
  );
}

export const EquipmentTab = ({ compact }: { compact?: boolean } = {}): ReactNode => {
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = useMemo(() => snapshot.members.find((m) => m.isLocal), [snapshot.members]);
  const equipment = local?.equipment ?? {};

  return (
    <div className="flex flex-col gap-3">
      <div className={`grid ${compact ? "grid-cols-2" : "grid-cols-3"} gap-2 place-items-center`}>
        {SLOT_LAYOUT.map((slotConfig) => (
          <EquipmentSlotItem
            key={slotConfig.key}
            slotConfig={slotConfig}
            instanceId={equipment[slotConfig.key]?.instanceId}
          />
        ))}
      </div>
    </div>
  );
};
