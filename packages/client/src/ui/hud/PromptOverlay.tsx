import { useSyncExternalStore } from "react";
import { promptStore } from "../stores/promptStore";
import { ConfirmDialog } from "../components/ConfirmDialog";

export const PromptOverlay = (): JSX.Element | null => {
  const { current } = useSyncExternalStore(promptStore.subscribe, promptStore.getSnapshot);

  if (!current) return null;

  return (
    <ConfirmDialog
      title={current.title}
      message={current.message}
      confirmLabel={current.confirmLabel}
      cancelLabel={current.cancelLabel}
      onConfirm={() => {
        current.onConfirm();
        promptStore.hide();
      }}
      onCancel={() => promptStore.hide()}
    />
  );
};
