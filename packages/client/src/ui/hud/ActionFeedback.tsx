import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { feedbackStore } from "../stores/feedbackStore";

export const ActionFeedback = (): ReactNode => {
  const { t } = useTranslation();
  const entries = useSyncExternalStore(feedbackStore.subscribe, feedbackStore.getSnapshot);

  if (entries.length === 0) return null;

  return (
    <div className="flex flex-col items-center gap-1">
      {entries.map((entry) => (
        <span
          key={entry.id}
          className="animate-feedback-float whitespace-nowrap rounded-full bg-black/60 px-3 py-1 text-xs font-medium text-red-400 backdrop-blur-sm"
        >
          {t(entry.i18nKey)}
        </span>
      ))}
    </div>
  );
};
