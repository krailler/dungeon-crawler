import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "../stores/hudStore";
import { MAX_SKILL_SLOTS, SKILL_DEFS } from "@dungeon/shared";
import type { SkillDef, SkillIdValue } from "@dungeon/shared";

// ── Skill icons (inline SVG) ─────────────────────────────────────────────────

const SwordIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-6 w-6"
  >
    <path d="M14.5 17.5L3 6V3h3l11.5 11.5" />
    <path d="M13 19l6-6" />
    <path d="M16 16l4 4" />
    <path d="M19 21l2-2" />
  </svg>
);

const LockIcon = (): JSX.Element => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="h-4 w-4 text-slate-600"
  >
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ICON_MAP: Record<string, () => JSX.Element> = {
  sword: SwordIcon,
};

// ── Skill slot component ─────────────────────────────────────────────────────

const SkillSlot = ({
  skill,
  keybind,
  active,
  onToggle,
}: {
  skill: SkillDef | null;
  keybind: string;
  active: boolean;
  onToggle: (() => void) | null;
}): JSX.Element => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const isEmpty = !skill;

  const IconComponent = skill ? ICON_MAP[skill.icon] : null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tooltip */}
      {hovered && skill && (
        <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-slate-600/40 bg-slate-900/95 px-3 py-2 text-center shadow-xl backdrop-blur-sm">
          <div className="text-[12px] font-semibold text-slate-100">{t(skill.i18nKey)}</div>
          <div className="mt-0.5 text-[11px] text-slate-400">{t(skill.i18nDescKey)}</div>
          {skill.passive && (
            <div
              className={`mt-1 text-[10px] font-medium uppercase tracking-wider ${active ? "text-emerald-400/80" : "text-red-400/80"}`}
            >
              {active ? t("skills.passive") : t("skills.disabled")}
            </div>
          )}
          <div className="mt-1 text-[10px] text-slate-500">{t("skills.clickToToggle")}</div>
        </div>
      )}

      {/* Slot */}
      <div
        onClick={onToggle ?? undefined}
        className={[
          "relative flex h-12 w-12 items-center justify-center rounded-lg border transition-all duration-150",
          isEmpty
            ? "border-slate-700/30 bg-slate-900/40 cursor-default"
            : active
              ? "border-sky-500/50 bg-slate-900/70 hover:border-sky-400/60 hover:bg-slate-800/60 cursor-pointer shadow-[0_0_8px_rgba(56,189,248,0.15)]"
              : "border-red-900/40 bg-slate-900/50 hover:border-red-800/50 hover:bg-slate-800/40 cursor-pointer opacity-60",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {/* Icon */}
        {IconComponent ? (
          <span className={active ? "text-slate-200" : "text-slate-500"}>
            <IconComponent />
          </span>
        ) : (
          <LockIcon />
        )}

        {/* Disabled overlay slash */}
        {skill && !active && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-[2px] w-8 rotate-45 bg-red-500/60 rounded-full" />
          </div>
        )}

        {/* Keybind badge */}
        <span
          className={[
            "absolute -bottom-1 left-1/2 -translate-x-1/2 rounded px-1.5 py-[1px] font-mono text-[9px] font-bold leading-none",
            isEmpty
              ? "bg-slate-800/60 text-slate-600"
              : active
                ? "bg-slate-800/80 text-slate-400"
                : "bg-slate-800/60 text-slate-600",
          ].join(" ")}
        >
          {keybind}
        </span>
      </div>
    </div>
  );
};

// ── SkillBar ─────────────────────────────────────────────────────────────────

export const SkillBar = (): JSX.Element => {
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const localMember = useMemo(() => snapshot.members.find((m) => m.isLocal), [snapshot.members]);
  const skills = localMember?.skills ?? [];
  const autoAttackEnabled = localMember?.autoAttackEnabled ?? true;

  // Build array of MAX_SKILL_SLOTS: resolved SkillDef or null for empty/locked slots
  const slots = useMemo(() => {
    const result: (SkillDef | null)[] = [];
    for (let i = 0; i < MAX_SKILL_SLOTS; i++) {
      const skillId = skills[i] as SkillIdValue | undefined;
      result.push(skillId && skillId in SKILL_DEFS ? SKILL_DEFS[skillId] : null);
    }
    return result;
  }, [skills]);

  // Check if a skill slot is active
  const isSlotActive = useCallback(
    (skill: SkillDef | null): boolean => {
      if (!skill) return false;
      if (skill.id === "basic_attack") return autoAttackEnabled;
      return true;
    },
    [autoAttackEnabled],
  );

  // Handle toggle for a skill
  const handleToggle = useCallback((skill: SkillDef | null) => {
    if (!skill) return;
    hudStore.toggleSkill(skill.id);
  }, []);

  // Keyboard shortcuts: 1-5 toggle skills
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      // Don't intercept if typing in input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= MAX_SKILL_SLOTS) {
        const skill = slots[idx - 1];
        if (skill) {
          hudStore.toggleSkill(skill.id);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [slots]);

  return (
    <div className="pointer-events-auto absolute bottom-[52px] left-1/2 -translate-x-1/2">
      <div className="flex items-center gap-1.5">
        {slots.map((skill, i) => (
          <SkillSlot
            key={skill?.id ?? `empty_${i}`}
            skill={skill}
            keybind={String(i + 1)}
            active={isSlotActive(skill)}
            onToggle={skill ? () => handleToggle(skill) : null}
          />
        ))}
      </div>
    </div>
  );
};
