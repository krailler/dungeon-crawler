import { useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { QuestStatus } from "@dungeon/shared";
import { dungeonSummaryStore } from "../stores/dungeonSummaryStore";
import { itemDefStore } from "../stores/itemDefStore";
import { GoldButton } from "../components/GoldButton";
import { CoinIcon } from "../icons/CoinIcon";
import { ItemIcon } from "../components/ItemIcon";
import { getRarityStyle } from "../utils/rarityColors";
import { playUiSfx } from "../../audio/uiSfx";

function formatDuration(totalSec: number): string {
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}m ${sec}s` : `${sec}s`;
}

export const DungeonSummaryOverlay = (): ReactNode => {
  const { t } = useTranslation();
  const { visible, summary } = useSyncExternalStore(
    dungeonSummaryStore.subscribe,
    dungeonSummaryStore.getSnapshot,
  );
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);

  useEffect(() => {
    if (visible) playUiSfx("ui_dungeon_complete");
  }, [visible]);

  if (!visible || !summary) return null;

  const hasBonus = summary.bonusGold > 0 || summary.bonusXp > 0;

  return (
    <div className="pointer-events-auto fixed inset-0 z-[900] flex items-center justify-center bg-black/70 backdrop-blur-sm animate-rise-in">
      <div className="relative w-[420px] max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-500/30 bg-slate-900/95 shadow-2xl shadow-amber-900/20">
        {/* Top glow bar */}
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/60 to-transparent" />

        <div className="px-8 py-8">
          {/* Title */}
          <div className="mb-1 text-center">
            <h2
              className="text-xl font-extrabold uppercase tracking-widest text-amber-400"
              style={{ textShadow: "0 0 20px rgba(251,191,36,0.4)" }}
            >
              {t("summary.title")}
            </h2>
          </div>
          <div className="mb-5 text-center text-[11px] font-medium tracking-wider text-slate-400">
            {t("summary.dungeonLevel", { level: summary.dungeonLevel })}
          </div>

          {/* Run Stats */}
          <div className="mb-5 flex items-center justify-center gap-5">
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-slate-200">
                {formatDuration(summary.durationSec)}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-500">
                {t("summary.duration")}
              </span>
            </div>
            <div className="h-6 w-px bg-slate-700/50" />
            <div className="flex flex-col items-center">
              <span
                className={`text-lg font-bold ${summary.totalDeaths === 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {summary.totalDeaths}
              </span>
              <span className="text-[9px] uppercase tracking-wider text-slate-500">
                {t("summary.deaths")}
              </span>
            </div>
            {summary.bossNameKey && (
              <>
                <div className="h-6 w-px bg-slate-700/50" />
                <div className="flex flex-col items-center">
                  <span
                    className={`text-lg font-bold ${summary.bossKilled ? "text-emerald-400" : "text-red-400"}`}
                  >
                    {summary.bossKilled ? "+" : "x"}
                  </span>
                  <span className="text-[9px] uppercase tracking-wider text-slate-500">
                    {t("summary.boss")}
                  </span>
                </div>
              </>
            )}
          </div>

          {/* Party */}
          {summary.players.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                {t("summary.party")}
              </div>
              <div className="flex flex-wrap gap-2">
                {summary.players.map((p) => (
                  <div
                    key={p.name}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-800/50 px-2.5 py-1.5"
                  >
                    <span className="text-[11px] font-medium text-slate-200">{p.name}</span>
                    <span className="text-[9px] text-slate-500">Lv.{p.level}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quests */}
          <div className="mb-5">
            <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
              {t("summary.questsTitle")}
            </div>
            <div className="flex flex-col gap-1.5">
              {summary.quests.map((quest) => {
                const completed = quest.status === QuestStatus.COMPLETED;
                const failed = quest.status === QuestStatus.FAILED;
                return (
                  <div
                    key={quest.questType}
                    className="flex items-center justify-between rounded-lg bg-slate-800/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-sm font-bold ${completed ? "text-emerald-400" : failed ? "text-red-400" : "text-slate-500"}`}
                      >
                        {completed ? "+" : failed ? "x" : "-"}
                      </span>
                      <span
                        className={`text-[12px] ${completed ? "text-slate-200" : failed ? "text-slate-500 line-through" : "text-slate-400"}`}
                      >
                        {t(quest.i18nKey)}
                      </span>
                    </div>
                    {quest.target > 0 && (
                      <span className="font-mono text-[10px] text-slate-500">
                        {quest.progress}/{quest.target}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notable Items */}
          {summary.items.length > 0 && (
            <div className="mb-5">
              <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                {t("summary.loot")}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {summary.items.map((item, i) => {
                  const def = itemDefs.get(item.itemId);
                  const rarityStyle = getRarityStyle(item.rarity);
                  return (
                    <div
                      key={`${item.itemId}-${i}`}
                      className={`flex items-center gap-1.5 rounded-lg bg-slate-800/50 px-2.5 py-1.5 border ${rarityStyle.border}`}
                    >
                      <ItemIcon iconId={def?.iconId ?? item.itemId} className="h-4 w-4" />
                      <span className={`text-[11px] font-medium ${rarityStyle.text}`}>
                        {def ? t(def.name) : item.itemId}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Bonus Rewards */}
          {hasBonus && (
            <div className="mb-6">
              <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                {t("summary.bonusRewards")}
              </div>
              <div className="flex items-center justify-center gap-6 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3">
                {summary.bonusGold > 0 && (
                  <div className="flex items-center gap-1.5">
                    <CoinIcon className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-bold text-amber-400">+{summary.bonusGold}</span>
                  </div>
                )}
                {summary.bonusXp > 0 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-cyan-400">XP</span>
                    <span className="text-sm font-bold text-cyan-300">+{summary.bonusXp}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Continue button */}
          <GoldButton
            onClick={() => {
              playUiSfx("ui_click");
              dungeonSummaryStore.dismiss();
            }}
            className="w-full"
          >
            {t("summary.continue")}
          </GoldButton>
        </div>

        {/* Bottom glow bar */}
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/30 to-transparent" />
      </div>
    </div>
  );
};
