import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { FullscreenIcon, ExitFullscreenIcon } from "../icons/FullscreenIcon";

/**
 * Global overlay rendered on all screens (login, lobby, game).
 * Contains the fullscreen toggle and "in development" badge.
 */
export const GlobalOverlay = (): ReactNode => {
  const { t } = useTranslation();
  const [isFullscreen, setIsFullscreen] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const onChange = (): void => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement
        .requestFullscreen()
        .then(() => {
          const nav = navigator as Navigator & {
            keyboard?: { lock?: (keys: string[]) => Promise<void> };
          };
          nav.keyboard?.lock?.(["Escape"]).catch(() => {});
        })
        .catch(() => {});
    }
  }, []);

  return (
    <>
      {/* Fullscreen toggle — top right */}
      <button
        onClick={toggleFullscreen}
        className="pointer-events-auto absolute top-4 right-4 flex h-7 w-7 items-center justify-center rounded-lg border border-slate-600/40 bg-slate-900/60 text-slate-400 shadow-lg shadow-black/30 backdrop-blur-md transition-all hover:border-slate-500/50 hover:text-slate-200"
        title={t("settings.fullscreen")}
      >
        {isFullscreen ? (
          <ExitFullscreenIcon className="h-3.5 w-3.5" />
        ) : (
          <FullscreenIcon className="h-3.5 w-3.5" />
        )}
      </button>

      {/* Dev banner — top center */}
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center">
        <span className="rounded-full bg-amber-500/10 px-4 py-1 text-[11px] font-medium text-amber-400/70 backdrop-blur-sm">
          {t("devBanner")}
        </span>
      </div>
    </>
  );
};
