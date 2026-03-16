import { useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { tutorialStore } from "../stores/tutorialStore";
import { playUiSfx } from "../../audio/uiSfx";

export const TutorialHint = (): JSX.Element | null => {
  const { t, i18n } = useTranslation();
  const { currentHint } = useSyncExternalStore(tutorialStore.subscribe, tutorialStore.getSnapshot);

  if (!currentHint) return null;

  const text = i18n.exists(currentHint.i18nKey) ? t(currentHint.i18nKey) : currentHint.i18nKey;

  return (
    <div className="pointer-events-auto absolute right-6 top-1/2 -translate-y-1/2">
      <div className="animate-tutorial-glow flex w-64 items-start gap-3 rounded-xl border border-sky-400/50 bg-slate-900/90 px-4 py-3 text-sm text-sky-200 shadow-lg shadow-sky-500/10 backdrop-blur">
        <span className="mt-0.5 shrink-0 text-lg">💡</span>
        <p className="flex-1 leading-snug">{text}</p>
        <button
          onClick={() => {
            playUiSfx("ui_click");
            tutorialStore.dismiss();
          }}
          className="shrink-0 text-sky-400/60 transition-colors hover:text-sky-200"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
};
