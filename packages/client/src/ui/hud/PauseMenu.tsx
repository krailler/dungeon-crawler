import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { authStore } from "../stores/authStore";
import { playUiSfx } from "../../audio/uiSfx";

export const PauseMenu = (): JSX.Element | null => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-72 rounded-2xl border border-slate-600/40 bg-slate-900/95 px-6 py-8 shadow-2xl backdrop-blur"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-6 text-center text-lg font-semibold text-slate-100">
          {t("pause.title")}
        </h2>
        <div className="flex flex-col gap-3">
          <button
            onClick={() => {
              playUiSfx("ui_click");
              setOpen(false);
            }}
            className="w-full rounded-xl border border-slate-600/40 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-slate-500/60 hover:bg-slate-700/80 hover:text-slate-100"
          >
            {t("pause.resume")}
          </button>
          <button
            onClick={() => {
              playUiSfx("ui_click");
              authStore.logout();
              window.location.reload();
            }}
            className="w-full rounded-xl border border-red-500/30 bg-slate-800/80 px-4 py-2.5 text-sm font-medium text-red-400 transition-colors hover:border-red-400/50 hover:bg-red-950/40 hover:text-red-300"
          >
            {t("pause.logout")}
          </button>
        </div>
      </div>
    </div>
  );
};
