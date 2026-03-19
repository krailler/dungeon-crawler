import type { ReactNode } from "react";

const ICON_PATH = "/textures/icons/";

/** Renders an item icon as an image from /textures/icons/{iconId}.png */
export const ItemIcon = ({
  iconId,
  className,
}: {
  iconId: string;
  className?: string;
}): ReactNode => (
  <img
    src={`${ICON_PATH}${iconId}.png`}
    alt=""
    className={className ?? "h-7 w-7"}
    draggable={false}
    style={{ imageRendering: "auto" }}
  />
);
