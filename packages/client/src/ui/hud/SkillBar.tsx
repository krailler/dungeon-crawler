import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { hudStore } from "../stores/hudStore";
import type { SkillCooldownState } from "../stores/hudStore";
import { SwordIcon } from "../icons/SwordIcon";
import { FistIcon } from "../icons/FistIcon";
import { LockIcon } from "../icons/LockIcon";
import { MAX_SKILL_SLOTS, SKILL_DEFS } from "@dungeon/shared";
import type { SkillDef, SkillIdValue } from "@dungeon/shared";

// ── Icon map (skill icon name → component) ───────────────────────────────────

const ICON_MAP: Record<string, (props: { className?: string }) => JSX.Element> = {
  sword: SwordIcon,
  fist: FistIcon,
};

// ── Cooldown overlay ─────────────────────────────────────────────────────────

const CooldownOverlay = ({
  cooldown,
  onComplete,
}: {
  cooldown: SkillCooldownState;
  onComplete: () => void;
}): JSX.Element | null => {
  const [remaining, setRemaining] = useState(() => {
    const elapsed = (Date.now() - cooldown.startedAt) / 1000;
    return Math.max(0, cooldown.duration - elapsed);
  });
  const completedRef = useRef(false);

  useEffect(() => {
    completedRef.current = false;
    const tick = (): void => {
      const elapsed = (Date.now() - cooldown.startedAt) / 1000;
      const r = Math.max(0, cooldown.duration - elapsed);
      setRemaining(r);
      if (r > 0) {
        frameId = requestAnimationFrame(tick);
      } else if (!completedRef.current) {
        completedRef.current = true;
        onComplete();
      }
    };
    let frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [cooldown.startedAt, cooldown.duration, onComplete]);

  if (remaining <= 0) return null;

  const fraction = remaining / cooldown.duration;

  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
      {/* Dark sweep overlay — fills from bottom up based on remaining fraction */}
      <div
        className="absolute inset-x-0 bottom-0 bg-black/60"
        style={{ height: `${fraction * 100}%` }}
      />
      {/* Countdown number */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-[14px] font-bold text-white/90 drop-shadow-md tabular-nums">
          {remaining < 1 ? remaining.toFixed(1) : Math.ceil(remaining)}
        </span>
      </div>
    </div>
  );
};

// ── Ready flash — plays once when cooldown finishes ──────────────────────────

const ReadyFlash = ({
  playing,
  onDone,
}: {
  playing: boolean;
  onDone: () => void;
}): JSX.Element | null => {
  useEffect(() => {
    if (!playing) return;
    const id = setTimeout(onDone, 600);
    return () => clearTimeout(id);
  }, [playing, onDone]);

  if (!playing) return null;

  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
      <div className="absolute inset-0 animate-[skill-ready_0.6s_ease-out_forwards] rounded-lg border-2 border-sky-400/80 bg-sky-400/20" />
    </div>
  );
};

// ── Skill slot component ─────────────────────────────────────────────────────

const CLICK_DURATION_MS = 150;

const SkillSlot = ({
  skill,
  keybind,
  active,
  onActivate,
  cooldown,
  activationCount,
}: {
  skill: SkillDef | null;
  keybind: string;
  active: boolean;
  onActivate: (() => void) | null;
  cooldown: SkillCooldownState | null;
  /** Increments on every activation (click or keybind) — triggers click pulse */
  activationCount: number;
}): JSX.Element => {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [showReady, setShowReady] = useState(false);
  const [showClick, setShowClick] = useState(false);
  const prevCountRef = useRef(activationCount);
  const isEmpty = !skill;
  const onCooldown =
    cooldown !== null && (Date.now() - cooldown.startedAt) / 1000 < cooldown.duration;

  const IconComponent = skill ? ICON_MAP[skill.icon] : null;

  // Trigger click pulse whenever activationCount changes (click or keyboard)
  useEffect(() => {
    if (activationCount !== prevCountRef.current) {
      prevCountRef.current = activationCount;
      setShowClick(true);
      const id = setTimeout(() => setShowClick(false), CLICK_DURATION_MS);
      return () => clearTimeout(id);
    }
  }, [activationCount]);

  const handleClick = useCallback(() => {
    if (!onActivate) return;
    onActivate();
  }, [onActivate]);

  const handleCooldownComplete = useCallback(() => {
    setShowReady(true);
  }, []);

  const clearReady = useCallback(() => setShowReady(false), []);

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
        </div>
      )}

      {/* Slot */}
      <div
        onClick={handleClick}
        className={[
          "relative flex h-12 w-12 items-center justify-center rounded-lg border",
          isEmpty
            ? "border-slate-700/30 bg-slate-900/40 cursor-default"
            : active
              ? "border-sky-500/50 bg-slate-900/70 hover:border-sky-400/60 hover:bg-slate-800/60 cursor-pointer shadow-[0_0_8px_rgba(56,189,248,0.15)]"
              : "border-red-900/40 bg-slate-900/50 hover:border-red-800/50 hover:bg-slate-800/40 cursor-pointer opacity-60",
          showClick && skill ? "scale-90" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          transition: `transform ${CLICK_DURATION_MS}ms ease-out, border-color 0.15s, background-color 0.15s`,
        }}
      >
        {/* Icon */}
        {IconComponent ? (
          <span className={active ? "text-slate-200" : "text-slate-500"}>
            <IconComponent />
          </span>
        ) : (
          <LockIcon className="h-4 w-4 text-slate-600" />
        )}

        {/* Disabled overlay slash (passive skills only) */}
        {skill && skill.passive && !active && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-[2px] w-8 rotate-45 bg-red-500/60 rounded-full" />
          </div>
        )}

        {/* Cooldown overlay (active skills) */}
        {onCooldown && cooldown && (
          <CooldownOverlay cooldown={cooldown} onComplete={handleCooldownComplete} />
        )}

        {/* Ready flash when cooldown completes */}
        <ReadyFlash playing={showReady} onDone={clearReady} />

        {/* Click / keybind pulse */}
        {showClick && skill && (
          <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
            <div
              className="absolute inset-0 rounded-lg bg-white/25"
              style={{ animation: `skill-click ${CLICK_DURATION_MS}ms ease-out forwards` }}
            />
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

  // Per-slot activation counter — drives click pulse in SkillSlot
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
    <div className="pointer-events-auto absolute bottom-[52px] left-1/2 -translate-x-1/2">
      <div className="flex items-center gap-1.5">
        {slots.map((skill, i) => (
          <SkillSlot
            key={skill?.id ?? `empty_${i}`}
            skill={skill}
            keybind={String(i + 1)}
            active={isSlotActive(skill)}
            onActivate={skill ? () => activateSlot(i) : null}
            cooldown={skill ? (snapshot.skillCooldowns.get(skill.id) ?? null) : null}
            activationCount={activations[i]}
          />
        ))}
      </div>
    </div>
  );
};
