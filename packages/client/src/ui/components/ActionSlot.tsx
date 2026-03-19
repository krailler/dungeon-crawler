import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { SkillCooldownState } from "../stores/hudStore";

// ── Cooldown overlay ────────────────────────────────────────────────────────

const CooldownOverlay = ({
  cooldown,
  textSize,
  onComplete,
}: {
  cooldown: SkillCooldownState;
  textSize: string;
  onComplete?: () => void;
}): ReactNode => {
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
        onComplete?.();
      }
    };
    let frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [cooldown.startedAt, cooldown.duration, onComplete]);

  if (remaining <= 0) return null;

  const fraction = remaining / cooldown.duration;

  return (
    <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
      <div
        className="absolute inset-x-0 bottom-0 bg-black/60"
        style={{ height: `${fraction * 100}%` }}
      />
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`${textSize} font-bold text-white/90 drop-shadow-md tabular-nums`}>
          {remaining < 1 ? remaining.toFixed(1) : Math.ceil(remaining)}
        </span>
      </div>
    </div>
  );
};

// ── Variant colors ──────────────────────────────────────────────────────────

type Variant = "default" | "red" | "empty";

const RARITY_BORDER: Record<string, string> = {
  uncommon: "border-emerald-400/80 shadow-[0_0_6px_rgba(52,211,153,0.3)]",
  rare: "border-blue-400/80 shadow-[0_0_6px_rgba(96,165,250,0.3)]",
  epic: "border-purple-400/80 shadow-[0_0_6px_rgba(192,132,252,0.3)]",
  legendary: "border-amber-400/80 shadow-[0_0_6px_rgba(251,191,36,0.3)]",
};

const VARIANT_COLORS: Record<
  Variant,
  {
    active: string;
    empty: string;
    disabled: string;
    readyBorder: string;
    readyBg: string;
    keybindActive: string;
    keybindEmpty: string;
    iconActive: string;
    iconDisabled: string;
    iconEmpty: string;
  }
> = {
  default: {
    active:
      "border-sky-500/50 bg-slate-900/70 hover:border-sky-400/60 hover:bg-slate-800/60 cursor-pointer shadow-[0_0_8px_rgba(56,189,248,0.15)]",
    empty: "border-slate-700/30 bg-slate-900/40 cursor-default",
    disabled:
      "border-red-900/40 bg-slate-900/50 hover:border-red-800/50 hover:bg-slate-800/40 cursor-pointer opacity-60",
    readyBorder: "border-sky-400/80",
    readyBg: "bg-sky-400/20",
    keybindActive: "bg-slate-800/80 text-slate-400",
    keybindEmpty: "bg-slate-800/60 text-slate-600",
    iconActive: "text-sky-300",
    iconDisabled: "text-slate-500",
    iconEmpty: "text-slate-600",
  },
  red: {
    active:
      "cursor-pointer border-rose-500/40 bg-slate-900/70 hover:border-rose-400/60 hover:bg-slate-800/60 shadow-[0_0_8px_rgba(244,63,94,0.15)]",
    empty: "cursor-default border-slate-700/30 bg-slate-900/40",
    disabled: "",
    readyBorder: "border-rose-400/80",
    readyBg: "bg-rose-400/20",
    keybindActive: "bg-slate-800/80 text-slate-400",
    keybindEmpty: "bg-slate-800/60 text-slate-600",
    iconActive: "text-rose-300",
    iconDisabled: "text-slate-500",
    iconEmpty: "text-slate-600",
  },
  empty: {
    active:
      "border-slate-600/50 bg-slate-800/60 hover:border-slate-500/60 hover:bg-slate-700/50 cursor-pointer",
    empty: "border-slate-700/30 bg-slate-900/40 cursor-default",
    disabled: "",
    readyBorder: "border-slate-400/80",
    readyBg: "bg-slate-400/20",
    keybindActive: "",
    keybindEmpty: "",
    iconActive: "text-slate-300",
    iconDisabled: "text-slate-500",
    iconEmpty: "text-slate-600",
  },
};

// ── Click pulse duration ────────────────────────────────────────────────────

const CLICK_DURATION_MS = 150;

// ── ActionSlot ──────────────────────────────────────────────────────────────

export type ActionSlotProps = {
  /** Icon element to display inside the slot */
  icon: ReactNode;
  /** Visual variant — drives colors, glow, ready flash */
  variant?: Variant;
  /** Slot size: "md" = 48px (skill bar / consumable), "sm" = 44px (inventory grid) */
  size?: "md" | "sm";
  /** Whether the slot has content (false = empty placeholder) */
  active?: boolean;
  /** Disabled look — lower opacity, red border (for passive skills turned off) */
  disabled?: boolean;
  /** Show diagonal red slash overlay (passive skills only) */
  disabledSlash?: boolean;
  /** Click handler */
  onClick?: () => void;
  /** Keyboard shortcut badge at bottom-center */
  keybind?: string;
  /** Item quantity badge */
  quantity?: number;
  /** Minimum quantity to show badge (default 1 = always show, 2 = only if >1) */
  quantityMin?: number;
  /** Quantity badge position */
  quantityPosition?: "top-right" | "bottom-right";
  /** Cooldown state */
  cooldown?: SkillCooldownState | null;
  /** External activation counter — drives click pulse from keyboard shortcuts */
  activationCount?: number;
  /** Structured tooltip: i18n name key */
  tooltipName?: string;
  /** Structured tooltip: i18n description key */
  tooltipDesc?: string;
  /** Structured tooltip: interpolation params for description */
  tooltipDescParams?: Record<string, unknown>;
  /** Structured tooltip: hint text shown below description (e.g. "Click to use") */
  tooltipHint?: string;
  /** Custom tooltip content — overrides structured tooltip props */
  tooltip?: ReactNode;
  /** Item rarity — adds a colored border (uncommon=green, rare=blue, epic=purple, legendary=gold) */
  rarity?: string;
};

export const ActionSlot = ({
  icon,
  variant = "default",
  size = "md",
  active = true,
  disabled = false,
  disabledSlash = false,
  onClick,
  keybind,
  quantity,
  quantityMin = 1,
  quantityPosition = "top-right",
  cooldown = null,
  activationCount = 0,
  tooltipName,
  tooltipDesc,
  tooltipDescParams,
  tooltipHint,
  tooltip,
  rarity,
}: ActionSlotProps): ReactNode => {
  const { t } = useTranslation();
  const colors = VARIANT_COLORS[variant];
  const sizeClass = size === "md" ? "h-12 w-12" : "h-11 w-11";
  const iconSize = size === "md" ? "[&>svg]:h-6 [&>svg]:w-6" : "[&>svg]:h-5 [&>svg]:w-5";
  const cdTextSize = size === "md" ? "text-[14px]" : "text-[11px]";

  const [hovered, setHovered] = useState(false);
  const [showReady, setShowReady] = useState(false);
  const [showClick, setShowClick] = useState(false);
  const prevCountRef = useRef(activationCount);

  const onCooldown =
    cooldown !== null && (Date.now() - cooldown.startedAt) / 1000 < cooldown.duration;

  // Click pulse from external activation counter (keyboard shortcuts)
  useEffect(() => {
    if (activationCount !== prevCountRef.current) {
      prevCountRef.current = activationCount;
      setShowClick(true);
      const id = setTimeout(() => setShowClick(false), CLICK_DURATION_MS);
      return () => clearTimeout(id);
    }
  }, [activationCount]);

  const handleClick = useCallback(() => {
    if (!onClick) return;
    onClick();
    // Trigger click pulse on direct click too
    setShowClick(true);
    setTimeout(() => setShowClick(false), CLICK_DURATION_MS);
  }, [onClick]);

  const handleCooldownComplete = useCallback(() => {
    setShowReady(true);
  }, []);

  const clearReady = useCallback(() => setShowReady(false), []);

  // Resolve slot style
  let slotStyle: string;
  if (!active) {
    slotStyle = colors.empty;
  } else if (disabled) {
    slotStyle = colors.disabled;
  } else {
    slotStyle = colors.active;
  }

  const showQty = quantity !== undefined && quantity >= quantityMin;

  return (
    <div
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Tooltip */}
      {hovered && (tooltip || tooltipName) && (
        <div className="pointer-events-none absolute bottom-full left-1/2 mb-2 -translate-x-1/2 z-50 whitespace-nowrap rounded-lg border border-slate-600/40 bg-slate-900/95 px-3 py-2 text-center shadow-xl backdrop-blur-sm">
          {tooltip ?? (
            <>
              <div className="text-[11px] font-semibold text-slate-100">{t(tooltipName!)}</div>
              {tooltipDesc && (
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {t(tooltipDesc, tooltipDescParams)}
                </div>
              )}
              {tooltipHint && (
                <div className="mt-1 text-[10px] text-emerald-400/80">{tooltipHint}</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Slot */}
      <div
        onClick={handleClick}
        className={[
          `relative flex ${sizeClass} items-center justify-center rounded-lg border`,
          slotStyle,
          rarity && active && RARITY_BORDER[rarity] ? RARITY_BORDER[rarity] : "",
          showClick && active ? "scale-90" : "",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{
          transition: `transform ${CLICK_DURATION_MS}ms ease-out, border-color 0.15s, background-color 0.15s`,
        }}
      >
        {/* Icon */}
        <span
          className={`${iconSize} ${!active ? colors.iconEmpty : disabled ? colors.iconDisabled : colors.iconActive}`}
        >
          {icon}
        </span>

        {/* Disabled slash overlay (passive skills) */}
        {disabledSlash && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="h-[2px] w-8 rotate-45 bg-red-500/60 rounded-full" />
          </div>
        )}

        {/* Quantity badge */}
        {showQty && quantityPosition === "top-right" && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-slate-800/90 px-1 text-[10px] font-bold text-slate-200 shadow ring-1 ring-slate-600/50">
            {quantity}
          </span>
        )}
        {showQty && quantityPosition === "bottom-right" && (
          <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded bg-slate-900/90 px-0.5 text-[9px] font-bold text-slate-300 ring-1 ring-slate-600/50">
            {quantity}
          </span>
        )}

        {/* Cooldown overlay */}
        {onCooldown && cooldown && (
          <CooldownOverlay
            cooldown={cooldown}
            textSize={cdTextSize}
            onComplete={handleCooldownComplete}
          />
        )}

        {/* Ready flash */}
        {showReady && (
          <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
            <div
              className={`absolute inset-0 animate-[skill-ready_0.6s_ease-out_forwards] rounded-lg border-2 ${colors.readyBorder} ${colors.readyBg}`}
              onAnimationEnd={clearReady}
            />
          </div>
        )}

        {/* Click pulse overlay */}
        {showClick && active && (
          <div className="absolute inset-0 rounded-lg overflow-hidden pointer-events-none">
            <div
              className="absolute inset-0 rounded-lg bg-white/25"
              style={{ animation: `skill-click ${CLICK_DURATION_MS}ms ease-out forwards` }}
            />
          </div>
        )}

        {/* Keybind badge */}
        {keybind && (
          <span
            className={`absolute -bottom-1 left-1/2 -translate-x-1/2 rounded px-1.5 py-[1px] font-mono text-[9px] font-bold leading-none ${
              active ? colors.keybindActive : colors.keybindEmpty
            }`}
          >
            {keybind}
          </span>
        )}
      </div>
    </div>
  );
};
