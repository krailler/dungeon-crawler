import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "../stores/hudStore";
import { SwordIcon } from "../icons/SwordIcon";
import { FistIcon } from "../icons/FistIcon";
import { LockIcon } from "../icons/LockIcon";
import { ActionSlot } from "../components/ActionSlot";
import { MAX_SKILL_SLOTS, SKILL_DEFS } from "@dungeon/shared";
import type { SkillDef, SkillIdValue } from "@dungeon/shared";

// ── Icon map (skill icon name → component) ───────────────────────────────────

const ICON_MAP: Record<string, (props: { className?: string }) => JSX.Element> = {
  sword: SwordIcon,
  fist: FistIcon,
};

// ── Skill tooltip content ────────────────────────────────────────────────────

const SkillTooltip = ({ skill, active }: { skill: SkillDef; active: boolean }): JSX.Element => {
  const { t } = useTranslation();
  return (
    <>
      <div className="text-[12px] font-semibold text-slate-100">{t(skill.i18nKey)}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">
        {t(skill.i18nDescKey, { multiplier: skill.damageMultiplier })}
      </div>
      {skill.passive && (
        <div
          className={`mt-1 text-[10px] font-medium uppercase tracking-wider ${active ? "text-emerald-400/80" : "text-red-400/80"}`}
        >
          {active ? t("skills.passive") : t("skills.disabled")}
        </div>
      )}
      {!skill.passive && skill.cooldown && (
        <div className="mt-1 text-[10px] text-amber-400/80">
          {t("skills.cooldown", { seconds: skill.cooldown })}
        </div>
      )}
      <div className="mt-1 text-[10px] text-slate-500">
        {skill.passive ? t("skills.clickToToggle") : t("skills.clickToUse")}
      </div>
    </>
  );
};

// ── SkillBar ─────────────────────────────────────────────────────────────────

export const SkillBar = (): JSX.Element => {
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const localMember = useMemo(() => snapshot.members.find((m) => m.isLocal), [snapshot.members]);
  const skills = localMember?.skills ?? [];
  const autoAttackEnabled = localMember?.autoAttackEnabled ?? true;

  // Per-slot activation counter — drives click pulse in ActionSlot
  const [activations, setActivations] = useState<number[]>(() =>
    Array.from({ length: MAX_SKILL_SLOTS }, () => 0),
  );

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

  // Activate a skill at a given slot index (fires action + bumps activation counter)
  const activateSlot = useCallback(
    (index: number) => {
      const skill = slots[index];
      if (!skill) return;
      // Bump activation counter for this slot → triggers click pulse
      setActivations((prev) => {
        const next = [...prev];
        next[index] = prev[index] + 1;
        return next;
      });
      // Fire the actual action
      if (skill.passive) {
        hudStore.toggleSkill(skill.id);
      } else {
        hudStore.useSkill(skill.id);
      }
    },
    [slots],
  );

  // Keyboard shortcuts: 1-5 activate skills
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = parseInt(e.key, 10);
      if (idx >= 1 && idx <= MAX_SKILL_SLOTS) {
        activateSlot(idx - 1);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activateSlot]);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {slots.map((skill, i) => {
          const active = isSlotActive(skill);
          const IconComponent = skill ? ICON_MAP[skill.icon] : null;

          return (
            <ActionSlot
              key={skill?.id ?? `empty_${i}`}
              variant="default"
              size="md"
              active={!!skill}
              disabled={skill ? !active : false}
              disabledSlash={!!skill?.passive && !active}
              icon={IconComponent ? <IconComponent /> : <LockIcon className="h-4 w-4" />}
              onClick={skill ? () => activateSlot(i) : undefined}
              keybind={String(i + 1)}
              cooldown={skill ? (snapshot.skillCooldowns.get(skill.id) ?? null) : null}
              activationCount={activations[i]}
              tooltip={skill ? <SkillTooltip skill={skill} active={active} /> : undefined}
            />
          );
        })}
      </div>
    </div>
  );
};
