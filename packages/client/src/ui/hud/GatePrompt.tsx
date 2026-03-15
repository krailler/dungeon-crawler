import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { gateStore } from "../stores/gateStore";

export const GatePrompt = (): JSX.Element | null => {
  const { t } = useTranslation();
  const gate = useSyncExternalStore(gateStore.subscribe, gateStore.getSnapshot);

  // Close prompt on Escape
  useEffect(() => {
    if (!gate.showPrompt) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        gateStore.hidePrompt();
      }
    };
    // Use capture phase so this runs BEFORE any bubble-phase listeners (PauseMenu, etc.)
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [gate.showPrompt]);

  // "Press F" hint
  if (gate.showInteractHint && !gate.isOpen) {
    return (
      <div className="pointer-events-none absolute bottom-32 left-1/2 -translate-x-1/2">
        <div className="animate-pulse rounded-xl border border-amber-400/40 bg-slate-900/90 px-5 py-2.5 text-sm font-medium text-amber-300 shadow-lg shadow-black/40 backdrop-blur">
          <kbd className="mr-2 rounded bg-amber-400/20 px-2 py-0.5 text-xs font-bold text-amber-200">
            F
          </kbd>
          {t("gate.interactHint")}
        </div>
      </div>
    );
  }

  // Confirmation dialog
  if (gate.showPrompt && !gate.isOpen) {
    return (
      <div className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-80 rounded-2xl border border-amber-500/30 bg-slate-900/95 p-6 shadow-2xl shadow-black/50 backdrop-blur">
          <h2 className="mb-2 text-center text-lg font-bold text-amber-400">
            {t("gate.promptTitle")}
          </h2>
          <p className="mb-6 text-center text-sm text-slate-400">{t("gate.promptMessage")}</p>
          <div className="flex gap-3">
            <button
              onClick={() => gateStore.hidePrompt()}
              className="flex-1 rounded-xl border border-slate-600/40 bg-slate-800/80 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500/60 hover:bg-slate-700/80 hover:text-slate-100"
            >
              {t("gate.promptCancel")}
            </button>
            <button
              onClick={() => gateStore.confirmOpen()}
              className="flex-1 rounded-xl border border-amber-500/40 bg-amber-600/20 px-4 py-2 text-sm font-bold text-amber-300 transition-colors hover:border-amber-400/60 hover:bg-amber-600/30 hover:text-amber-200"
            >
              {t("gate.promptAccept")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
