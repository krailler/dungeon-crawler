import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { authStore } from "../stores/authStore";
import { tutorialStore } from "../stores/tutorialStore";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { MenuButton } from "../components/MenuButton";
import { SettingsPanel } from "./SettingsPanel";

type View = "menu" | "settings";

export const PauseMenu = (): ReactNode => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("menu");
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen((prev) => {
          if (prev) {
            setConfirmReset(false);
            setView("menu");
          }
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  const close = (): void => {
    setOpen(false);
    setConfirmReset(false);
    setView("menu");
  };

  return (
    <div
      className="pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className={[
          "rounded-2xl border border-slate-600/40 bg-slate-900/95 shadow-2xl backdrop-blur transition-all",
          view === "settings" ? "w-[420px] px-6 py-6" : "w-72 px-6 py-8",
        ].join(" ")}
        onClick={(e) => e.stopPropagation()}
      >
        {view === "menu" && (
          <>
            <h2 className="mb-6 text-center text-lg font-semibold text-slate-100">
              {t("pause.title")}
            </h2>
            <div className="flex flex-col gap-3">
              <MenuButton onClick={close} className="w-full">
                {t("pause.resume")}
              </MenuButton>
              <MenuButton onClick={() => setView("settings")} className="w-full">
                {t("pause.settings")}
              </MenuButton>
              <MenuButton onClick={() => setConfirmReset(true)} className="w-full">
                {t("pause.resetTutorials")}
              </MenuButton>
              <MenuButton
                variant="danger"
                onClick={() => {
                  authStore.logout();
                  window.location.reload();
                }}
                className="w-full"
              >
                {t("pause.logout")}
              </MenuButton>
            </div>
          </>
        )}

        {view === "settings" && <SettingsPanel onBack={() => setView("menu")} />}
      </div>

      {confirmReset && (
        <ConfirmDialog
          title={t("pause.resetTutorialsTitle")}
          message={t("pause.resetTutorialsMessage")}
          confirmLabel={t("pause.resetTutorialsConfirm")}
          cancelLabel={t("pause.resetTutorialsCancel")}
          onConfirm={() => {
            tutorialStore.resetAll();
            setConfirmReset(false);
          }}
          onCancel={() => setConfirmReset(false)}
        />
      )}
    </div>
  );
};
