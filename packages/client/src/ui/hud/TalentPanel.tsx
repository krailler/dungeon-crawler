import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TalentDefClient } from "@dungeon/shared";
import { TutorialStep, TALENT_RESET_GOLD_PER_LEVEL } from "@dungeon/shared";
import { HudPanel } from "../components/HudPanel";
import { Tooltip } from "../components/Tooltip";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { talentStore } from "../stores/talentStore";
import { talentDefStore } from "../stores/talentDefStore";
import { hudStore } from "../stores/hudStore";
import { skillDefStore } from "../stores/skillDefStore";
import { tutorialStore } from "../stores/tutorialStore";
import { playUiSfx } from "../../audio/uiSfx";
import { ItemIcon } from "../components/ItemIcon";

/** Map internal stat names to i18n keys */
const STAT_I18N: Record<string, string> = {
  maxHealth: "character.health",
  attackDamage: "character.attackDamage",
  defense: "character.defense",
  moveSpeed: "talents.statMoveSpeed",
};

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
      const statLabel = t(STAT_I18N[e.statModifier.stat] ?? e.statModifier.stat);
      if (e.statModifier.type === "percent") {
        desc = `${sign}${Math.round(e.statModifier.value * 100)}% ${statLabel}`;
      } else {
        desc = `${sign}${e.statModifier.value} ${statLabel}`;
      }
    } else if (e.skillModifier) {
      const skillDef = skillDefStore.get(e.skillModifier.skillId);
      const skillName = skillDef ? t(skillDef.name) : e.skillModifier.skillId;
      const parts: string[] = [];
      if (e.skillModifier.cooldownMul)
        parts.push(`${Math.round(e.skillModifier.cooldownMul * 100)}% ${t("talents.modCooldown")}`);
      if (e.skillModifier.damageMul)
        parts.push(`${Math.round(e.skillModifier.damageMul * 100)}% ${t("talents.modDamage")}`);
      desc = `${skillName}: ${parts.join(", ")}`;
    } else if (e.skillId) {
      const skillDef = skillDefStore.get(e.skillId);
      const skillName = skillDef ? t(skillDef.name) : e.skillId;
      desc = `${t("talents.unlockSkill")}: ${skillName}`;
    }
    const active = e.rank <= currentRank;
    return (
      <div key={e.rank} className={active ? "text-white" : "text-zinc-400"}>
        {t("talents.rank")} {e.rank}: {desc}
      </div>
    );
  });

  const tooltipContent = (
    <>
      <div className="font-bold text-amber-300">{t(def.name)}</div>
      <div className="mt-0.5 text-zinc-400">{t(def.description)}</div>
      {def.requiredLevel > 1 && (
        <div className="mt-1 text-zinc-500">
          {t("talents.requiresLevel")}: {def.requiredLevel}
        </div>
      )}
      <div className="mt-1 space-y-0.5">{rankLines}</div>
    </>
  );

  return (
    <div data-talent-id={def.id}>
      <Tooltip content={tooltipContent} width="w-48" className="p-2 text-xs">
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
          <ItemIcon iconId={def.icon} className="h-full w-full rounded-md" />
          <span className="absolute -bottom-1 -right-1 rounded-full bg-zinc-900 px-1 text-[9px] font-bold text-zinc-300">
            {currentRank}/{def.maxRank}
          </span>
        </button>
      </Tooltip>
    </div>
  );
};

/** Tree grid with SVG connector lines measured from actual DOM positions */
const TalentTree = ({
  talents,
  rows,
  maxCols,
  allocations,
  canAllocate,
  onAllocate,
}: {
  talents: TalentDefClient[];
  rows: [number, TalentDefClient[]][];
  maxCols: number;
  allocations: Map<string, number>;
  canAllocate: (def: TalentDefClient) => boolean;
  onAllocate: (talentId: string) => void;
}): ReactNode => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<
    { x1: number; y1: number; x2: number; y2: number; fulfilled: boolean }[]
  >([]);

  // Measure node positions after render
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const newLines: typeof lines = [];
    for (const t of talents) {
      if (!t.requiredTalentId) continue;
      const childEl = container.querySelector(`[data-talent-id="${t.id}"]`);
      const parentEl = container.querySelector(`[data-talent-id="${t.requiredTalentId}"]`);
      if (!childEl || !parentEl) continue;

      const childRect = childEl.getBoundingClientRect();
      const parentRect = parentEl.getBoundingClientRect();

      const parentRank = allocations.get(t.requiredTalentId) ?? 0;
      newLines.push({
        x1: parentRect.left + parentRect.width / 2 - rect.left,
        y1: parentRect.top + parentRect.height / 2 - rect.top,
        x2: childRect.left + childRect.width / 2 - rect.left,
        y2: childRect.top + childRect.height / 2 - rect.top,
        fulfilled: parentRank >= t.requiredTalentRank,
      });
    }
    setLines(newLines);
  }, [talents, allocations]);

  return (
    <div ref={containerRef} className="relative flex flex-col items-center gap-4">
      {/* SVG connector lines */}
      {lines.length > 0 && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
          {lines.map((l, i) => (
            <line
              key={i}
              x1={l.x1}
              y1={l.y1}
              x2={l.x2}
              y2={l.y2}
              stroke={l.fulfilled ? "#34d399" : "#52525b"}
              strokeWidth={2}
              strokeDasharray={l.fulfilled ? undefined : "4 4"}
            />
          ))}
        </svg>
      )}

      {rows.map(([rowIdx, rowTalents]) => (
        <div key={rowIdx} className="flex gap-3">
          {Array.from({ length: maxCols }, (_, colIdx) => {
            const def = rowTalents.find((t) => t.col === colIdx);
            if (!def) return <div key={colIdx} className="h-12 w-12" />;
            const currentRank = allocations.get(def.id) ?? 0;
            return (
              <TalentNode
                key={def.id}
                def={def}
                currentRank={currentRank}
                canAllocate={canAllocate(def)}
                onClick={() => onAllocate(def.id)}
              />
            );
          })}
        </div>
      ))}
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

      {/* Tree grid with connector lines */}
      <TalentTree
        talents={talents}
        rows={rows}
        maxCols={maxCols}
        allocations={talentSnap.allocations}
        canAllocate={canAllocateTalent}
        onAllocate={handleAllocate}
      />

      {/* Reset button */}
      {talentSnap.allocations.size > 0 && (
        <div className="mt-3 border-t border-zinc-700/50 pt-3">
          <Tooltip content={!canReset ? t("talents.resetNotEnoughGold", { cost: resetCost }) : ""}>
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
          </Tooltip>
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
