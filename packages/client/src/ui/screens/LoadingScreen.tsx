import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { loadingStore, LoadingPhase } from "../stores/loadingStore";
import { GameLogo } from "../components/GameLogo";

export const LoadingScreen = (): ReactNode => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(loadingStore.subscribe, loadingStore.getSnapshot);

  if (!snapshot.visible) return null;

  const isError = snapshot.phase === LoadingPhase.ERROR;
  const phaseKey = `loading.${snapshot.phase}`;

  return (
    <div
      className={`pointer-events-auto fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#05070d] transition-opacity duration-700 ${
        snapshot.fadingOut ? "opacity-0" : "opacity-100"
      }`}
    >
      {/* Logo */}
      <GameLogo className="mb-12" />

      {/* Progress bar */}
      <div className="w-80 overflow-hidden rounded-full border border-slate-600/40 bg-slate-900/80 p-0.5">
        <div
          className="h-2.5 rounded-full bg-gradient-to-r from-amber-500/80 via-amber-400/60 to-amber-500/80 transition-[width] duration-500 ease-out"
          style={{ width: `${snapshot.progress}%` }}
        />
      </div>

      {/* Phase text */}
      <p
        className={`mt-4 text-sm tracking-wide ${
          isError ? "text-red-400" : "animate-pulse text-slate-400"
        }`}
      >
        {t(phaseKey)}
      </p>
    </div>
  );
};
