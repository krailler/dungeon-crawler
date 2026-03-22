import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export const LobbyMarketTab = (): ReactNode => {
  const { t } = useTranslation();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" className="text-slate-600">
        <path
          d="M3 9h18l-1.5 9a2 2 0 01-2 1.5H6.5a2 2 0 01-2-1.5L3 9zm0 0l1.5-4.5A1 1 0 015.5 4h13a1 1 0 011 .5L21 9M10 13h4"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <p className="text-sm text-slate-500">{t("lobby.marketSoon")}</p>
    </div>
  );
};
