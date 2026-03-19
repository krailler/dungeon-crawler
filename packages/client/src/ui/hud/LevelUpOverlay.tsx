import { useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { levelUpStore } from "../stores/levelUpStore";
import { playUiSfx } from "../../audio/uiSfx";

const DISPLAY_DURATION = 3500;

export const LevelUpOverlay = (): ReactNode => {
  const { t } = useTranslation();
  const { visible, level } = useSyncExternalStore(levelUpStore.subscribe, levelUpStore.getSnapshot);

  useEffect(() => {
    if (!visible) return;
    playUiSfx("level_up");
    const timer = setTimeout(() => levelUpStore.hide(), DISPLAY_DURATION);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-start justify-center pt-[15%] overflow-hidden">
      {/* Radial burst background */}
      <div className="absolute animate-levelup-burst rounded-full bg-amber-400/10 blur-3xl" />

      {/* Main text */}
      <div className="relative flex flex-col items-center animate-levelup-text">
        {/* Glow behind text */}
        <div className="absolute -inset-8 rounded-full bg-amber-500/20 blur-2xl" />

        <div className="relative text-sm font-bold uppercase tracking-[0.3em] text-amber-300/90">
          {t("hud.levelUp")}
        </div>
        <div
          className="relative -mt-1 font-black text-amber-200 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]"
          style={{ fontSize: "5rem", lineHeight: 1 }}
        >
          {level}
        </div>
      </div>

      {/* CSS animations */}
      <style>{`
        .animate-levelup-text {
          animation: levelup-text 3s ease-out forwards;
        }
        @keyframes levelup-text {
          0% { opacity: 0; transform: scale(0.3); }
          15% { opacity: 1; transform: scale(1.15); }
          25% { transform: scale(1); }
          75% { opacity: 1; }
          100% { opacity: 0; transform: scale(1.1) translateY(-20px); }
        }
        .animate-levelup-burst {
          width: 300px;
          height: 300px;
          animation: levelup-burst 2s ease-out forwards;
        }
        @keyframes levelup-burst {
          0% { opacity: 0; transform: scale(0); }
          30% { opacity: 0.6; transform: scale(1); }
          100% { opacity: 0; transform: scale(2.5); }
        }
      `}</style>
    </div>
  );
};
