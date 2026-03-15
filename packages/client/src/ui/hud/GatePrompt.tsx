import { useEffect, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { gateStore } from "../stores/gateStore";
import { promptStore } from "../stores/promptStore";

/** "Press F" interaction hint — shown when the leader is near the gate */
export const GateHint = (): JSX.Element | null => {
  const { t } = useTranslation();
  const gate = useSyncExternalStore(gateStore.subscribe, gateStore.getSnapshot);

  useEffect(() => {
    if (!gate.showInteractHint || !gate.nearestInteractableId) return;

    const handleKey = (ev: KeyboardEvent): void => {
      if (ev.key !== "f" && ev.key !== "F") return;
      // Don't trigger if typing in an input
      if (ev.target instanceof HTMLInputElement || ev.target instanceof HTMLTextAreaElement) return;

      const snap = gateStore.getSnapshot();
      if (!snap.nearestInteractableId) return;
      const info = snap.gates.get(snap.nearestInteractableId);
      if (!info || info.isOpen) return;

      promptStore.show({
        title: t("gate.promptTitle"),
        message: t("gate.promptMessage"),
        confirmLabel: t("gate.promptAccept"),
        cancelLabel: t("gate.promptCancel"),
        onConfirm: () => gateStore.confirmOpenNearest(),
      });
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [gate.showInteractHint, gate.nearestInteractableId, t]);

  if (!gate.showInteractHint) return null;

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
