import { useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { QuestStatus, QuestType } from "@dungeon/shared";
import { questStore } from "../stores/questStore";
import type { QuestEntry } from "../stores/questStore";

/** Status icon with color */
function StatusIcon({ quest }: { quest: QuestEntry }): ReactNode {
  if (quest.status === QuestStatus.COMPLETED) {
    return <span className="text-[11px] text-emerald-400">✓</span>;
  }
  if (quest.status === QuestStatus.FAILED) {
    return <span className="text-[11px] text-red-400">✗</span>;
  }
  // Active — show type-specific icon
  if (quest.questType === QuestType.KILL_ALL) {
    return <span className="text-[10px] text-amber-400">⚔</span>;
  }
  if (quest.questType === QuestType.BOSS_TIMED) {
    return <span className="text-[10px] text-amber-400">⏱</span>;
  }
  return <span className="text-[10px] text-amber-400">♦</span>;
}

/** Thin progress bar for kill_all */
function ProgressBar({ progress, target }: { progress: number; target: number }): ReactNode {
  const pct = Math.min(100, (progress / target) * 100);
  return (
    <div className="mt-0.5 h-[4px] w-full overflow-hidden rounded-full bg-slate-700/50">
      <div
        className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-amber-400/90 transition-[width] duration-300 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Countdown bar — shrinks from full to empty, changes color as time runs out */
function CountdownBar({ remaining, total }: { remaining: number; total: number }): ReactNode {
  const pct = Math.min(100, Math.max(0, (remaining / total) * 100));
  const urgent = pct < 30;
  return (
    <div className="mt-0.5 h-[4px] w-full overflow-hidden rounded-full bg-slate-700/50">
      <div
        className={`h-full rounded-full transition-[width] duration-1000 ease-linear ${
          urgent
            ? "bg-gradient-to-r from-red-500/90 to-red-400/80"
            : "bg-gradient-to-r from-cyan-500/80 to-cyan-400/90"
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

const QuestRow = ({ quest }: { quest: QuestEntry }): ReactNode => {
  const { t } = useTranslation();
  const isCompleted = quest.status === QuestStatus.COMPLETED;
  const isFailed = quest.status === QuestStatus.FAILED;

  const nameColor = isCompleted
    ? "text-emerald-400"
    : isFailed
      ? "text-red-400/60 line-through"
      : "text-slate-200";

  // Progress value for right side
  let progressLabel: string | null = null;
  if (quest.questType === QuestType.KILL_ALL && !isCompleted) {
    progressLabel = `${quest.progress}/${quest.target}`;
  } else if (quest.questType === QuestType.BOSS_TIMED && quest.status === QuestStatus.ACTIVE) {
    progressLabel = `${quest.progress}s`;
  }

  const showKillBar = quest.questType === QuestType.KILL_ALL && !isCompleted && !isFailed;
  const showTimerBar =
    quest.questType === QuestType.BOSS_TIMED &&
    quest.status === QuestStatus.ACTIVE &&
    quest.progress < quest.target;

  return (
    <div className="flex flex-col gap-0">
      <div className="flex items-center gap-1.5">
        <StatusIcon quest={quest} />
        <span className={`text-[11px] leading-tight ${nameColor}`}>{t(quest.i18nKey)}</span>
        {progressLabel && (
          <span className="ml-auto font-mono text-[10px] text-slate-400">{progressLabel}</span>
        )}
      </div>
      {showKillBar && <ProgressBar progress={quest.progress} target={quest.target} />}
      {showTimerBar && <CountdownBar remaining={quest.progress} total={quest.target} />}
    </div>
  );
};

export const QuestTracker = (): ReactNode => {
  const { t } = useTranslation();
  const quests = useSyncExternalStore(questStore.subscribe, questStore.getSnapshot);

  if (quests.size === 0) return null;

  const questList = Array.from(quests.values());

  return (
    <div className="pointer-events-none absolute left-4 top-12 w-[210px]">
      <div className="rounded-xl border border-slate-700/30 bg-slate-950/60 px-3 py-2.5 backdrop-blur-sm">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.15em] text-amber-400/70">
          {t("quest.title")}
        </div>
        <div className="flex flex-col gap-2">
          {questList.map((quest) => (
            <QuestRow key={quest.id} quest={quest} />
          ))}
        </div>
      </div>
    </div>
  );
};
