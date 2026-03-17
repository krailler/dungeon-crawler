import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { announcementStore } from "../stores/announcementStore";
import { ANNOUNCEMENT_FADE_MS } from "@dungeon/shared";

export const AnnouncementOverlay = (): ReactNode => {
  const { t, i18n } = useTranslation();
  const { current } = useSyncExternalStore(
    announcementStore.subscribe,
    announcementStore.getSnapshot,
  );

  if (!current) return null;

  // Resolve text: prefer i18n key if available and the key exists
  let displayText = current.text;
  if (current.i18nKey && i18n.exists(current.i18nKey)) {
    displayText = t(current.i18nKey, current.i18nParams ?? {});
  }

  return (
    <div className="pointer-events-none absolute inset-x-0 top-[20%] flex justify-center">
      <p
        key={current.id}
        className="animate-announcement-in text-center text-2xl font-bold tracking-wide text-amber-300 drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)]"
        style={
          {
            "--fade-duration": `${ANNOUNCEMENT_FADE_MS}ms`,
          } as React.CSSProperties
        }
      >
        {displayText}
      </p>
    </div>
  );
};
