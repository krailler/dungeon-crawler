import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { gateStore } from "../stores/gateStore";

/** "Press F" interaction hint — shown when the leader is near the gate */
export const GateHint = (): JSX.Element | null => {
  const { t } = useTranslation();
  const gate = useSyncExternalStore(gateStore.subscribe, gateStore.getSnapshot);

  if (!gate.showInteractHint || gate.isOpen) return null;

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
};
