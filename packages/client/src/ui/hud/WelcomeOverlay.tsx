import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { welcomeStore } from "../stores/welcomeStore";
import { playUiSfx } from "../../audio/uiSfx";

export const WelcomeOverlay = (): ReactNode => {
  const { t } = useTranslation();
  const { visible } = useSyncExternalStore(welcomeStore.subscribe, welcomeStore.getSnapshot);

  if (!visible) return null;

  const handleDismiss = (): void => {
    playUiSfx("ui_click");
    welcomeStore.dismiss();
  };

  const tips = [
    { icon: "sword", text: t("welcome.tip1") },
    { icon: "skull", text: t("welcome.tip2") },
    { icon: "star", text: t("welcome.tip3") },
    { icon: "key", text: t("welcome.tip4") },
  ];

  const iconMap: Record<string, string> = {
    sword: "\u2694\uFE0F",
    skull: "\uD83D\uDC80",
    star: "\u2B50",
    key: "\uD83D\uDD11",
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-[500] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="animate-welcome-in relative mx-4 w-full max-w-md overflow-hidden rounded-2xl border border-sky-500/30 bg-gradient-to-b from-slate-900/98 to-slate-950/98 shadow-[0_0_40px_rgba(56,189,248,0.15)]">
        {/* Glow accent */}
        <div className="absolute -top-20 left-1/2 h-40 w-80 -translate-x-1/2 rounded-full bg-sky-500/10 blur-3xl" />

        {/* Content */}
        <div className="relative flex flex-col items-center px-8 pb-8 pt-6">
          {/* Logo */}
          <img
            src="/textures/logo.png"
            alt="KrawlHero"
            className="mb-2 h-16 object-contain drop-shadow-[0_0_12px_rgba(56,189,248,0.3)]"
          />

          {/* Subtitle */}
          <p className="mb-6 text-center text-sm text-slate-400">{t("welcome.subtitle")}</p>

          {/* Tips */}
          <div className="mb-6 w-full space-y-3">
            {tips.map((tip, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg border border-slate-700/40 bg-slate-800/40 px-4 py-2.5"
              >
                <span className="mt-0.5 text-lg leading-none">{iconMap[tip.icon]}</span>
                <p className="text-[13px] leading-relaxed text-slate-300">{tip.text}</p>
              </div>
            ))}
          </div>

          {/* Button */}
          <button
            onClick={handleDismiss}
            className="w-full rounded-lg border border-sky-500/50 bg-sky-600/20 px-6 py-2.5 text-sm font-semibold text-sky-300 transition-all hover:border-sky-400/70 hover:bg-sky-500/30 hover:text-sky-200 active:scale-[0.98]"
          >
            {t("welcome.button")}
          </button>
        </div>
      </div>
    </div>
  );
};
