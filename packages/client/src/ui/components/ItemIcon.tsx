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
  const sizeCls = fill ? "h-full w-full" : (className ?? "h-7 w-7");

  return (
    <>
      {!loaded && (
        <div className="absolute inset-0 overflow-hidden rounded-lg">
          <div className="absolute inset-0 bg-slate-700/50 animate-shimmer" />
        </div>
      )}
      <img
        src={`${ICON_PATH}${iconId}.png`}
        alt=""
        className={`${sizeCls} ${fill ? "object-contain p-2" : ""} ${loaded ? "opacity-100" : "opacity-0"} transition-opacity duration-150`}
        draggable={false}
        style={{ imageRendering: "auto" }}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </>
  );
};
