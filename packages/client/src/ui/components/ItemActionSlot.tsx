import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ActionSlot } from "./ActionSlot";
import { ItemIcon } from "./ItemIcon";
import { EquipmentTooltip } from "./EquipmentTooltip";
import { itemDefStore } from "../stores/itemDefStore";
import { itemInstanceStore } from "../stores/itemInstanceStore";
import { insertItemLink } from "../hud/itemLinkUtils";
import type { SkillCooldownState } from "../stores/hudStore";

export type ItemActionSlotProps = {
  /** Item template ID */
  itemId?: string;
  /** Item instance ID (for equipment with rolled stats) */
  instanceId?: string;
  /** Quantity to display */
  quantity?: number;
  /** Minimum quantity to show badge */
  quantityMin?: number;
  /** Quantity badge position */
  quantityPosition?: "top-right" | "bottom-right";
  /** Cooldown state */
  cooldown?: SkillCooldownState | null;
  /** Slot size */
  size?: "md" | "sm";
  /** Visual variant */
  variant?: "default" | "red" | "empty";
  /** Left-click handler */
  onClick?: () => void;
  /** Right-click handler (without Shift — e.g. equip, use consumable) */
  onRightClick?: () => void;
  /** Instance ID of equipped item in matching slot (for Shift compare) */
  compareInstanceId?: string;
  /** Extra hint text appended to tooltip */
  hint?: string;
};

/**
 * Item-aware ActionSlot wrapper. Handles:
 * - Auto-loading item def + instance data
 * - Equipment tooltip with rolled stats
 * - Shift+click/right-click to insert item link in chat
 * - Shift-held comparison with equipped item
 * - Loading shimmer when data not yet available
 */
export const ItemActionSlot = ({
  itemId,
  instanceId,
  quantity,
  quantityMin = 2,
  quantityPosition = "bottom-right",
  cooldown,
  size = "sm",
  variant = "empty",
  onClick,
  onRightClick,
  compareInstanceId,
  hint,
}: ItemActionSlotProps): ReactNode => {
  const { t } = useTranslation();
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);

  const def = itemId ? itemDefs.get(itemId) : undefined;
  const isEquipment = !!def?.equipSlot;
  const active = !!itemId;
  const loading = active && !def;

  // Trigger lazy-load
  useEffect(() => {
    if (itemId) itemDefStore.ensureLoaded([itemId]);
  }, [itemId]);
  useEffect(() => {
    if (instanceId) itemInstanceStore.ensureLoaded([instanceId]);
  }, [instanceId]);

  // Track Shift key for equipment comparison
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    if (!isEquipment || !compareInstanceId) return;
    const onDown = (e: KeyboardEvent): void => {
      if (e.key === "Shift") setShiftHeld(true);
    };
    const onUp = (e: KeyboardEvent): void => {
      if (e.key === "Shift") setShiftHeld(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      setShiftHeld(false);
    };
  }, [isEquipment, compareInstanceId]);

  // Shift+click = insert item link, otherwise normal click
  const handleClick = useCallback(
    (e?: React.MouseEvent) => {
      if (e?.shiftKey && itemId) {
        e.preventDefault();
        insertItemLink(itemId, instanceId);
        return;
      }
      onClick?.();
    },
    [onClick, itemId, instanceId],
  );

  // Context menu: Shift = item link, otherwise = onRightClick
  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.shiftKey && itemId) {
        insertItemLink(itemId, instanceId);
      } else if (!e.shiftKey && onRightClick) {
        onRightClick();
      }
    },
    [itemId, instanceId, onRightClick],
  );

  // Build tooltip
  const tooltip = useMemo((): ReactNode | undefined => {
    if (!def) return undefined;

    if (instanceId && def.equipSlot) {
      // Equipment tooltip with rolled stats
      const hintParts: string[] = [];
      if (hint) hintParts.push(hint);
      if (compareInstanceId && !shiftHeld) hintParts.push(t("equipment.shiftToCompare"));
      return (
        <EquipmentTooltip
          def={def}
          instanceId={instanceId}
          hint={hintParts.length > 0 ? hintParts.join(" · ") : undefined}
          compareInstanceId={shiftHeld ? compareInstanceId : undefined}
        />
      );
    }

    return undefined; // Fall through to structured tooltip
  }, [def, instanceId, hint, compareInstanceId, shiftHeld, t]);

  // Structured tooltip props (for non-equipment items)
  const tooltipName = !tooltip && def ? def.name : undefined;
  const tooltipDesc = !tooltip && def ? def.description : undefined;
  const tooltipDescParams = !tooltip && def ? def.effectParams : undefined;
  const tooltipHint = !tooltip && def ? hint : undefined;

  return (
    <ActionSlot
      variant={variant}
      size={size}
      active={active}
      loading={loading}
      icon={
        def ? (
          <ItemIcon iconId={def.icon} />
        ) : active ? (
          <span className="text-[14px]">?</span>
        ) : (
          <></>
        )
      }
      quantity={quantity}
      quantityMin={quantityMin}
      quantityPosition={quantityPosition}
      cooldown={cooldown}
      tooltip={tooltip}
      tooltipName={tooltipName}
      tooltipDesc={tooltipDesc}
      tooltipDescParams={tooltipDescParams}
      tooltipHint={tooltipHint}
      rarity={def?.rarity}
      onClick={handleClick}
      onContextMenu={active ? handleContextMenu : undefined}
    />
  );
};
