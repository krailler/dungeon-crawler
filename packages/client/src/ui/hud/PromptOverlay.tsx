import { useEffect, useRef, useSyncExternalStore } from "react";
import { promptStore } from "../stores/promptStore";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { playUiSfx } from "../../audio/uiSfx";

export const PromptOverlay = (): JSX.Element | null => {
  const { current } = useSyncExternalStore(promptStore.subscribe, promptStore.getSnapshot);
  const prevRef = useRef(current);

  // Play rollover sound when a new prompt appears
  useEffect(() => {
    if (current && !prevRef.current) {
      playUiSfx("ui_rollover");
    }
    prevRef.current = current;
  }, [current]);

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
