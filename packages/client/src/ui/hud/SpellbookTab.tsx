import { useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { ClassSkillEntry, SkillDef } from "@dungeon/shared";
import { computeTalentSkillMods } from "@dungeon/shared";
import { hudStore } from "../stores/hudStore";
import { classDefStore } from "../stores/classDefStore";
import { skillDefStore } from "../stores/skillDefStore";
import { talentDefStore } from "../stores/talentDefStore";
import { talentStore } from "../stores/talentStore";
import { ItemIcon } from "../components/ItemIcon";
import { LockIcon } from "../icons/LockIcon";

const SkillRow = ({
  entry,
  skillDef,
  unlocked,
  cooldownMul,
  damageMul,
}: {
  entry: ClassSkillEntry;
  skillDef: SkillDef | undefined;
  unlocked: boolean;
  cooldownMul: number;
  damageMul: number;
}): ReactNode => {
  const { t } = useTranslation();

  if (!skillDef) return null;

  const effectiveCooldown = parseFloat((skillDef.cooldown * cooldownMul).toFixed(1));
  const effectiveDamage = parseFloat((skillDef.damageMultiplier * damageMul).toFixed(2));

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-2 py-2 ${
        unlocked ? "bg-slate-800/40" : "bg-slate-900/30 opacity-50"
      }`}
    >
      {/* Icon */}
      <div
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border ${
          unlocked ? "border-slate-500/50 bg-slate-800" : "border-zinc-700/50 bg-zinc-900"
        }`}
      >
        <ItemIcon iconId={skillDef.icon} fill />
        {!unlocked && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <LockIcon className="h-4 w-4 text-zinc-500" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-semibold ${unlocked ? "text-slate-100" : "text-zinc-500"}`}
          >
            {t(skillDef.name)}
          </span>
          {entry.isDefault && (
            <span className="rounded bg-emerald-500/20 px-1.5 py-0.5 text-[9px] font-medium text-emerald-400">
              {t("skills.passiveAlwaysActive")}
            </span>
          )}
        </div>
        <div className={`text-[11px] ${unlocked ? "text-slate-400" : "text-zinc-600"}`}>
          {t(skillDef.description, {
            multiplier: effectiveDamage,
            threshold: Math.round(skillDef.hpThreshold * 100),
          })}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-2">
          {!unlocked && (
            <span className="text-[10px] text-amber-500/80">
              {t("skills.unlocksAtLevel", { level: entry.unlockLevel })}
            </span>
          )}
          {unlocked && !entry.isDefault && effectiveCooldown > 0 && (
            <span className="text-[10px] text-amber-400/70">
              {t("skills.cooldown", { seconds: effectiveCooldown })}
              {cooldownMul !== 1 && (
                <span className="ml-1 text-green-400/70">
                  ({t("skills.cdReduced", { percent: Math.round((1 - cooldownMul) * 100) })})
                </span>
              )}
            </span>
          )}
          {unlocked && damageMul !== 1 && skillDef.damageMultiplier > 0 && (
            <span className="text-[10px] text-green-400/70">
              {t("skills.dmgBoosted", { percent: Math.round((damageMul - 1) * 100) })}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export const SpellbookTab = (): ReactNode => {
  const { t } = useTranslation();
  const hudSnap = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const classDefs = useSyncExternalStore(classDefStore.subscribe, classDefStore.getSnapshot);
  const skillDefs = useSyncExternalStore(skillDefStore.subscribe, skillDefStore.getSnapshot);
  const talentDefs = useSyncExternalStore(talentDefStore.subscribe, talentDefStore.getSnapshot);
  const talentSnap = useSyncExternalStore(talentStore.subscribe, talentStore.getSnapshot);

  const localMember = useMemo(() => hudSnap.members.find((m) => m.isLocal), [hudSnap.members]);
  const playerLevel = localMember?.level ?? 1;
  const classId = localMember?.classId;
  const classDef = classId ? classDefs.get(classId) : undefined;

  // Ensure skill defs are loaded
  useEffect(() => {
    if (classDef?.skills && classDef.skills.length > 0) {
      skillDefStore.ensureLoaded(classDef.skills.map((s) => s.skillId));
    }
  }, [classDef?.skills]);

  // Sort skills: unlocked first, then by unlock level
  const sortedSkills = useMemo(() => {
    if (!classDef?.skills) return [];
    return [...classDef.skills].sort((a, b) => {
      const aUnlocked = a.unlockLevel <= playerLevel;
      const bUnlocked = b.unlockLevel <= playerLevel;
      if (aUnlocked !== bUnlocked) return aUnlocked ? -1 : 1;
      return a.unlockLevel - b.unlockLevel;
    });
  }, [classDef?.skills, playerLevel]);

  if (!classDef || sortedSkills.length === 0) {
    return (
      <div className="py-8 text-center text-xs text-slate-500">
        {t("skills.spellbookEmpty", { defaultValue: "No skills available" })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {sortedSkills.map((entry) => {
        const mods = computeTalentSkillMods(
          talentDefs.values(),
          talentSnap.allocations,
          entry.skillId,
        );
        return (
          <SkillRow
            key={entry.skillId}
            entry={entry}
            skillDef={skillDefs.get(entry.skillId)}
            unlocked={entry.unlockLevel <= playerLevel}
            cooldownMul={mods.cooldownMul}
            damageMul={mods.damageMul}
          />
        );
      })}
    </div>
  );
};
