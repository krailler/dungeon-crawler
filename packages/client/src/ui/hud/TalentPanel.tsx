import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TalentDefClient } from "@dungeon/shared";
import { TutorialStep, TALENT_RESET_GOLD_PER_LEVEL } from "@dungeon/shared";
import { HudPanel } from "../components/HudPanel";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { talentStore } from "../stores/talentStore";
import { talentDefStore } from "../stores/talentDefStore";
import { hudStore } from "../stores/hudStore";
import { tutorialStore } from "../stores/tutorialStore";
import { playUiSfx } from "../../audio/uiSfx";

/** Props for the panel */
interface TalentPanelProps {
  onClose: () => void;
}

/** A single talent node in the tree */
const TalentNode = ({
  def,
  currentRank,
  canAllocate,
  onClick,
}: {
  def: TalentDefClient;
  currentRank: number;
  canAllocate: boolean;
  onClick: () => void;
}): ReactNode => {
  const { t } = useTranslation();
  const isMaxed = currentRank >= def.maxRank;
  const isLocked = currentRank === 0 && !canAllocate;

  // Determine border color based on state
  let borderColor = "border-zinc-600"; // locked
  if (isMaxed) borderColor = "border-amber-400";
  else if (currentRank > 0) borderColor = "border-emerald-400";
  else if (canAllocate) borderColor = "border-sky-400";

  // Build tooltip description showing all ranks
  const rankLines = def.effects.map((e) => {
    let desc = "";
    if (e.statModifier) {
      const sign = e.statModifier.value > 0 ? "+" : "";
      if (e.statModifier.type === "percent") {
        desc = `${sign}${Math.round(e.statModifier.value * 100)}% ${e.statModifier.stat}`;
      } else {
        desc = `${sign}${e.statModifier.value} ${e.statModifier.stat}`;
      }
    } else if (e.skillModifier) {
      const parts: string[] = [];
      if (e.skillModifier.cooldownMul)
        parts.push(`${Math.round(e.skillModifier.cooldownMul * 100)}% CD`);
      if (e.skillModifier.damageMul)
        parts.push(`${Math.round(e.skillModifier.damageMul * 100)}% DMG`);
      desc = `${e.skillModifier.skillId}: ${parts.join(", ")}`;
    } else if (e.skillId) {
      desc = `Unlock: ${e.skillId}`;
    }
    const active = e.rank <= currentRank;
    return (
      <div key={e.rank} className={active ? "text-white" : "text-zinc-400"}>
        {t("talents.rank")} {e.rank}: {desc}
      </div>
    );
  });

  return (
    <div className="group relative">
      <button
        className={`pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-lg border-2 ${borderColor} transition-colors ${
          canAllocate && !isMaxed
            ? "cursor-pointer bg-zinc-800 hover:bg-zinc-700"
            : "cursor-default bg-zinc-900"
        } ${isLocked ? "opacity-40" : ""}`}
        onClick={() => {
          if (canAllocate && !isMaxed) {
            onClick();
            playUiSfx("ui_click");
          }
        }}
      >
        <span className="text-lg">{def.icon}</span>
        <span className="absolute -bottom-1 -right-1 rounded-full bg-zinc-900 px-1 text-[9px] font-bold text-zinc-300">
          {currentRank}/{def.maxRank}
        </span>
      </button>
      {/* Tooltip */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden w-48 -translate-x-1/2 rounded-lg border border-zinc-600 bg-zinc-900/95 p-2 text-xs shadow-lg group-hover:block">
        <div className="font-bold text-amber-300">{t(def.name)}</div>
        <div className="mt-0.5 text-zinc-400">{t(def.description)}</div>
        {def.requiredLevel > 1 && (
          <div className="mt-1 text-zinc-500">
            {t("talents.requiresLevel")}: {def.requiredLevel}
          </div>
        )}
        <div className="mt-1 space-y-0.5">{rankLines}</div>
      </div>
    </div>
  );
};

export const TalentPanel = ({ onClose }: TalentPanelProps): ReactNode => {
  const { t } = useTranslation();
  const talentSnap = useSyncExternalStore(talentStore.subscribe, talentStore.getSnapshot);
  const defsSnap = useSyncExternalStore(talentDefStore.subscribe, talentDefStore.getSnapshot);
  const hudSnap = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);

  const localMember = useMemo(() => hudSnap.members.find((m) => m.isLocal), [hudSnap.members]);
  const playerLevel = localMember?.level ?? 1;
  const talentPoints = localMember?.talentPoints ?? 0;

  // Ensure defs are loaded when panel opens
  useEffect(() => {
    if (talentSnap.classTalentIds.length > 0) {
      talentDefStore.ensureLoaded(talentSnap.classTalentIds);
    }
  }, [talentSnap.classTalentIds]);

  // Build the tree layout from known class talent ids
  const talents = useMemo(() => {
    const result: TalentDefClient[] = [];
    for (const id of talentSnap.classTalentIds) {
      const def = defsSnap.get(id);
      if (def) result.push(def);
    }
    return result.sort((a, b) => a.row * 100 + a.col - (b.row * 100 + b.col));
  }, [talentSnap.classTalentIds, defsSnap]);

  // Group by row
  const rows = useMemo(() => {
    const map = new Map<number, TalentDefClient[]>();
    for (const t of talents) {
      const row = map.get(t.row) ?? [];
      row.push(t);
      map.set(t.row, row);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [talents]);

  const maxCols = useMemo(() => {
    let max = 0;
    for (const t of talents) {
      if (t.col + 1 > max) max = t.col + 1;
    }
    return Math.max(max, 3);
  }, [talents]);

  const canAllocateTalent = useCallback(
    (def: TalentDefClient): boolean => {
      if (talentPoints <= 0) return false;
      const currentRank = talentSnap.allocations.get(def.id) ?? 0;
      if (currentRank >= def.maxRank) return false;
      if (playerLevel < def.requiredLevel) return false;
      if (def.requiredTalentId) {
        const prereqRank = talentSnap.allocations.get(def.requiredTalentId) ?? 0;
        if (prereqRank < def.requiredTalentRank) return false;
      }
      return true;
    },
    [talentSnap, talentPoints, playerLevel],
  );

  const handleAllocate = useCallback((talentId: string) => {
    talentStore.allocateTalent(talentId);
    tutorialStore.dismiss(TutorialStep.ALLOCATE_TALENTS);
  }, []);

  // Reset talents with gold
  const resetCost = playerLevel * TALENT_RESET_GOLD_PER_LEVEL;
  const canReset = talentSnap.allocations.size > 0 && (localMember?.gold ?? 0) >= resetCost;
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleResetConfirm = useCallback(() => {
    talentStore.resetTalents();
    setShowResetConfirm(false);
    playUiSfx("ui_click");
  }, []);

  return (
    <HudPanel
      header={<span className="text-sm font-semibold text-slate-200">{t("talents.title")}</span>}
      onClose={onClose}
      className="absolute right-72 top-5 w-72"
      panelId="talent"
      defaultPosition={{ x: window.innerWidth - 600, y: 80 }}
    >
      {/* Header with points */}
      {talentPoints > 0 && (
        <div className="mb-2 flex items-center justify-center gap-1 rounded bg-sky-500/20 px-2 py-1 text-xs text-sky-300">
          <span className="font-bold">{talentPoints}</span>
          <span>{t("talents.pointsAvailable")}</span>
        </div>
      )}

      {/* Tree grid */}
      <div className="flex flex-col items-center gap-4">
        {rows.map(([rowIdx, rowTalents]) => (
          <div key={rowIdx} className="flex gap-3" style={{ minWidth: maxCols * 56 }}>
            {Array.from({ length: maxCols }, (_, colIdx) => {
              const def = rowTalents.find((t) => t.col === colIdx);
              if (!def) return <div key={colIdx} className="h-12 w-12" />;
              const currentRank = talentSnap.allocations.get(def.id) ?? 0;
              return (
                <TalentNode
                  key={def.id}
                  def={def}
                  currentRank={currentRank}
                  canAllocate={canAllocateTalent(def)}
                  onClick={() => handleAllocate(def.id)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Reset button */}
      {talentSnap.allocations.size > 0 && (
        <div className="group/reset relative mt-3 border-t border-zinc-700/50 pt-3">
          <button
            onClick={() => {
              if (canReset) {
                playUiSfx("ui_click");
                setShowResetConfirm(true);
              }
            }}
            className={`w-full rounded-lg px-3 py-1.5 text-xs transition-colors ${
              canReset
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "cursor-not-allowed text-zinc-600"
            }`}
          >
            {t("talents.reset", { cost: resetCost })}
          </button>
          {!canReset && (
            <div className="pointer-events-none absolute bottom-full left-1/2 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg border border-zinc-600 bg-zinc-900/95 px-2 py-1 text-[11px] text-zinc-300 shadow-lg group-hover/reset:block">
              {t("talents.resetNotEnoughGold", { cost: resetCost })}
            </div>
          )}
        </div>
      )}

      {/* Reset confirmation dialog */}
      {showResetConfirm && (
        <ConfirmDialog
          variant="inline"
          title={t("talents.resetTitle")}
          message={t("talents.resetMessage", { cost: resetCost })}
          confirmLabel={t("talents.resetConfirm")}
          cancelLabel={t("talents.resetCancel")}
          onConfirm={handleResetConfirm}
          onCancel={() => setShowResetConfirm(false)}
        />
      )}
    </HudPanel>
  );
};
