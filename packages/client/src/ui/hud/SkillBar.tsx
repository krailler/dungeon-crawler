import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "../stores/hudStore";
import { skillDefStore } from "../stores/skillDefStore";
import { settingsStore, displayKeyName } from "../stores/settingsStore";
import type { BindableActionValue } from "../stores/settingsStore";
import { LockIcon } from "../icons/LockIcon";
import { ActionSlot } from "../components/ActionSlot";
import { ItemIcon } from "../components/ItemIcon";
import { MAX_SKILL_SLOTS } from "@dungeon/shared";
import type { SkillDef } from "@dungeon/shared";

// ── Skill tooltip content ────────────────────────────────────────────────────

const SkillTooltip = ({ skill, active }: { skill: SkillDef; active: boolean }): ReactNode => {
  const { t } = useTranslation();
  return (
    <>
      <div className="text-[12px] font-semibold text-slate-100">{t(skill.name)}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">
        {t(skill.description, { multiplier: skill.damageMultiplier })}
      </div>
      {skill.passive && (
        <div
          className={`mt-1 text-[10px] font-medium uppercase tracking-wider ${active ? "text-emerald-400/80" : "text-red-400/80"}`}
        >
          {active ? t("skills.passive") : t("skills.disabled")}
        </div>
      )}
      {!skill.passive && skill.cooldown > 0 && (
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

export const SkillBar = (): ReactNode => {
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const skillDefs = useSyncExternalStore(skillDefStore.subscribe, skillDefStore.getSnapshot);
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
      const skillId = skills[i];
      result.push(skillId ? (skillDefs.get(skillId) ?? null) : null);
    }
    return result;
  }, [skills, skillDefs]);

  // Check if a skill slot is active
  const isSlotActive = useCallback(
    (skill: SkillDef | null): boolean => {
      if (!skill) return false;
      if (skill.passive) return autoAttackEnabled;
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

  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);

  // Build skill binding keys array from settings
  const skillBindKeys: string[] = useMemo(() => {
    const actions: BindableActionValue[] = ["skill_1", "skill_2", "skill_3", "skill_4", "skill_5"];
    return actions.map((a) => settings.keybindings[a]);
  }, [settings.keybindings]);

  // Keyboard shortcuts: activate skills via configurable bindings
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const idx = skillBindKeys.indexOf(e.key);
      if (idx >= 0 && idx < MAX_SKILL_SLOTS) {
        activateSlot(idx);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activateSlot, skillBindKeys]);

  return (
    <div>
      <div className="flex items-center gap-1.5">
        {slots.map((skill, i) => {
          const active = isSlotActive(skill);

          return (
            <ActionSlot
              key={skill?.id ?? `empty_${i}`}
              variant="default"
              size="md"
              active={!!skill}
              disabled={skill ? !active : false}
              disabledSlash={!!skill?.passive && !active}
              icon={skill ? <ItemIcon iconId={skill.icon} /> : <LockIcon className="h-4 w-4" />}
              onClick={skill ? () => activateSlot(i) : undefined}
              keybind={displayKeyName(skillBindKeys[i])}
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
