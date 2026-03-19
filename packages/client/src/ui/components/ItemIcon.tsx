import { useState } from "react";
import type { ReactNode } from "react";

const ICON_PATH = "/textures/icons/";

/** Renders an item icon as an image from /textures/icons/{iconId}.png */
export const ItemIcon = ({
  iconId,
  className,
  fill,
}: {
  iconId: string;
  className?: string;
  /** When true, icon fills its parent container (h-full w-full rounded-lg) */
  fill?: boolean;
}): ReactNode => {
  const [loaded, setLoaded] = useState(false);
  const cls = fill ? "h-full w-full rounded-lg" : (className ?? "h-7 w-7");

  return (
    <div className={`relative ${cls}`}>
      {!loaded && (
        <div className={`absolute inset-0 overflow-hidden rounded ${cls}`}>
          <div className="absolute inset-0 bg-slate-700/50 animate-shimmer" />
        </div>
      )}
      <img
        src={`${ICON_PATH}${iconId}.png`}
        alt=""
        className={`${cls} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-150`}
        draggable={false}
        style={{ imageRendering: "auto" }}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
};
