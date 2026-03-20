import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "../stores/hudStore";
import { skillDefStore } from "../stores/skillDefStore";
import { talentDefStore } from "../stores/talentDefStore";
import { talentStore } from "../stores/talentStore";
import { settingsStore, displayKeyName } from "../stores/settingsStore";
import type { BindableActionValue } from "../stores/settingsStore";
import { LockIcon } from "../icons/LockIcon";
import { ActionSlot } from "../components/ActionSlot";
import { ItemIcon } from "../components/ItemIcon";
import { MAX_SKILL_SLOTS, computeTalentSkillMods } from "@dungeon/shared";
import type { SkillDef } from "@dungeon/shared";

// ── Skill tooltip content ────────────────────────────────────────────────────

const SkillTooltip = ({
  skill,
  cooldownMul,
  damageMul,
}: {
  skill: SkillDef;
  cooldownMul: number;
  damageMul: number;
}): ReactNode => {
  const { t } = useTranslation();
  const effectiveCooldown = parseFloat((skill.cooldown * cooldownMul).toFixed(1));
  const effectiveDamage = parseFloat((skill.damageMultiplier * damageMul).toFixed(2));
  return (
    <>
      <div className="text-[12px] font-semibold text-slate-100">{t(skill.name)}</div>
      <div className="mt-0.5 text-[11px] text-slate-400">
        {t(skill.description, {
          multiplier: effectiveDamage,
          threshold: Math.round(skill.hpThreshold * 100),
        })}
      </div>
      {effectiveCooldown > 0 && (
        <div className="mt-1 text-[10px] text-amber-400/80">
          {t("skills.cooldown", { seconds: effectiveCooldown })}
          {cooldownMul !== 1 && (
            <span className="ml-1 text-green-400/70">
              ({t("skills.cdReduced", { percent: Math.round((1 - cooldownMul) * 100) })})
            </span>
          )}
        </div>
      )}
      {damageMul !== 1 && skill.damageMultiplier > 0 && (
        <div className="text-[10px] text-green-400/70">
          {t("skills.dmgBoosted", { percent: Math.round((damageMul - 1) * 100) })}
        </div>
      )}
      <div className="mt-1 text-[10px] text-slate-500">{t("skills.clickToUse")}</div>
    </>
  );
};

// ── SkillBar ─────────────────────────────────────────────────────────────────

export const SkillBar = (): ReactNode => {
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const skillDefs = useSyncExternalStore(skillDefStore.subscribe, skillDefStore.getSnapshot);
  const talentDefs = useSyncExternalStore(talentDefStore.subscribe, talentDefStore.getSnapshot);
  const talentSnap = useSyncExternalStore(talentStore.subscribe, talentStore.getSnapshot);
  const localMember = useMemo(() => snapshot.members.find((m) => m.isLocal), [snapshot.members]);
  const skills = localMember?.skills ?? [];

  // Per-slot activation counter — drives click pulse in ActionSlot
  const [activations, setActivations] = useState<number[]>(() =>
    Array.from({ length: MAX_SKILL_SLOTS }, () => 0),
  );

  // Build array of MAX_SKILL_SLOTS: resolved SkillDef or null for empty/locked slots
  // Filter out passive skills (auto-attack) — they don't need a hotbar slot
  const slots = useMemo(() => {
    const active: (SkillDef | null)[] = [];
    for (const skillId of skills) {
      if (!skillId) continue;
      const def = skillDefs.get(skillId);
      if (def?.passive) continue;
      active.push(def ?? null);
    }
    // Pad to MAX_SKILL_SLOTS with nulls
    while (active.length < MAX_SKILL_SLOTS) {
      active.push(null);
    }
    return active.slice(0, MAX_SKILL_SLOTS);
  }, [skills, skillDefs]);

  // Activate a skill at a given slot index (fires action + bumps activation counter)
  const activateSlot = useCallback(
    (index: number) => {
      const skill = slots[index];
      if (!skill) return;
      setActivations((prev) => {
        const next = [...prev];
        next[index] = prev[index] + 1;
        return next;
      });
      hudStore.useSkill(skill.id);
    },
    [slots],
  );

  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);

  // Build skill binding keys array from settings
  const skillBindKeys: string[] = useMemo(() => {
    const actions: BindableActionValue[] = ["skill_1", "skill_2", "skill_3", "skill_4", "skill_5"];
    return actions.map((a) => settings.keybindings[a]);
  }, [settings.keybindings]);

  // Precompute talent skill mods for each slot
  const slotMods = useMemo(
    () =>
      slots.map((skill) =>
        skill
          ? computeTalentSkillMods(talentDefs.values(), talentSnap.allocations, skill.id)
          : { cooldownMul: 1, damageMul: 1 },
      ),
    [slots, talentDefs, talentSnap.allocations],
  );

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
        {slots.map((skill, i) => (
          <ActionSlot
            key={skill?.id ?? `empty_${i}`}
            variant="default"
            size="md"
            active={!!skill}
            icon={skill ? <ItemIcon iconId={skill.icon} fill /> : <LockIcon className="h-4 w-4" />}
            onClick={skill ? () => activateSlot(i) : undefined}
            keybind={displayKeyName(skillBindKeys[i])}
            cooldown={skill ? (snapshot.skillCooldowns.get(skill.id) ?? null) : null}
            activationCount={activations[i]}
            tooltip={
              skill ? (
                <SkillTooltip
                  skill={skill}
                  cooldownMul={slotMods[i].cooldownMul}
                  damageMul={slotMods[i].damageMul}
                />
              ) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
};
