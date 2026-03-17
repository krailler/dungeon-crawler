import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { settingsStore, BindableAction, displayKeyName } from "../stores/settingsStore";
import type { BindableActionValue, VolumeSettings } from "../stores/settingsStore";
import { MenuButton } from "../components/MenuButton";
import { playUiSfx } from "../../audio/uiSfx";

// ── Types ───────────────────────────────────────────────────────────────────

type Tab = "audio" | "keybindings";

type SettingsPanelProps = {
  onBack: () => void;
};

// ── Volume slider row ───────────────────────────────────────────────────────

const VolumeSlider = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): ReactNode => (
  <div className="flex items-center gap-3">
    <span className="w-28 shrink-0 text-xs text-slate-300">{label}</span>
    <input
      type="range"
      min="0"
      max="100"
      step="1"
      value={Math.round(value * 100)}
      onChange={(e) => onChange(Number(e.target.value) / 100)}
      className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-700 accent-amber-500 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-500"
    />
    <span className="w-9 text-right text-[11px] font-mono text-slate-400">
      {Math.round(value * 100)}%
    </span>
  </div>
);

// ── Audio tab ───────────────────────────────────────────────────────────────

const AudioTab = (): ReactNode => {
  const { t } = useTranslation();
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);

  const setVol = useCallback((key: keyof VolumeSettings, v: number) => {
    settingsStore.setVolume(key, v);
  }, []);

  return (
    <div className="flex flex-col gap-3.5">
      <VolumeSlider
        label={t("settings.masterVolume")}
        value={settings.volume.master}
        onChange={(v) => setVol("master", v)}
      />
      <VolumeSlider
        label={t("settings.sfxVolume")}
        value={settings.volume.sfx}
        onChange={(v) => setVol("sfx", v)}
      />
      <VolumeSlider
        label={t("settings.ambientVolume")}
        value={settings.volume.ambient}
        onChange={(v) => setVol("ambient", v)}
      />
      <VolumeSlider
        label={t("settings.uiVolume")}
        value={settings.volume.ui}
        onChange={(v) => setVol("ui", v)}
      />

      <div className="mt-2 border-t border-slate-600/30 pt-2">
        <MenuButton onClick={() => settingsStore.resetVolume()} className="w-full">
          {t("settings.resetVolume")}
        </MenuButton>
      </div>
    </div>
  );
};

// ── Keybinding action labels (i18n keys) ────────────────────────────────────

const ACTION_ORDER: { action: BindableActionValue; i18nKey: string }[] = [
  { action: BindableAction.SPRINT, i18nKey: "settings.sprint" },
  { action: BindableAction.CHAT, i18nKey: "settings.chat" },
  { action: BindableAction.INTERACT, i18nKey: "settings.interact" },
  { action: BindableAction.SKILL_1, i18nKey: "settings.skill1" },
  { action: BindableAction.SKILL_2, i18nKey: "settings.skill2" },
  { action: BindableAction.SKILL_3, i18nKey: "settings.skill3" },
  { action: BindableAction.SKILL_4, i18nKey: "settings.skill4" },
  { action: BindableAction.SKILL_5, i18nKey: "settings.skill5" },
  { action: BindableAction.CONSUMABLE_1, i18nKey: "settings.consumable1" },
  { action: BindableAction.CHARACTER, i18nKey: "settings.characterPanel" },
  { action: BindableAction.INVENTORY, i18nKey: "settings.inventoryPanel" },
  { action: BindableAction.MINIMAP, i18nKey: "settings.minimapPanel" },
  { action: BindableAction.FULLSCREEN, i18nKey: "settings.fullscreen" },
  { action: BindableAction.TAB_TARGET, i18nKey: "settings.tabTarget" },
];

// ── Keybindings tab ─────────────────────────────────────────────────────────

const KeybindingsTab = (): ReactNode => {
  const { t } = useTranslation();
  const settings = useSyncExternalStore(settingsStore.subscribe, settingsStore.getSnapshot);
  const [capturing, setCapturing] = useState<BindableActionValue | null>(null);

  // Capture key press when in capture mode
  useEffect(() => {
    if (!capturing) return;

    const handleKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopImmediatePropagation();

      // Escape cancels capture without rebinding
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }

      // Ignore lone modifier presses (Shift, Ctrl, Alt, Meta) UNLESS we're binding sprint
      const modifierKeys = new Set(["Control", "Alt", "Meta"]);
      if (modifierKeys.has(e.key)) return;

      settingsStore.setKeybinding(capturing, e.key);
      setCapturing(null);
    };

    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [capturing]);

  return (
    <div className="flex flex-col gap-1">
      {ACTION_ORDER.map(({ action, i18nKey }) => {
        const isCapturing = capturing === action;
        return (
          <button
            key={action}
            onClick={() => {
              playUiSfx("ui_click");
              setCapturing(isCapturing ? null : action);
            }}
            className={[
              "flex items-center justify-between rounded px-2 py-1.5 text-xs transition-colors",
              isCapturing
                ? "bg-amber-500/20 text-amber-300"
                : "text-slate-300 hover:bg-slate-800/60 hover:text-slate-100",
            ].join(" ")}
          >
            <span>{t(i18nKey)}</span>
            <kbd
              className={[
                "min-w-[32px] rounded border px-1.5 py-0.5 text-center text-[11px] font-mono",
                isCapturing
                  ? "animate-pulse border-amber-500/50 bg-amber-500/10 text-amber-300"
                  : "border-slate-600/40 bg-slate-800/80 text-slate-400",
              ].join(" ")}
            >
              {isCapturing ? t("settings.pressKey") : displayKeyName(settings.keybindings[action])}
            </kbd>
          </button>
        );
      })}

      <div className="mt-2 border-t border-slate-600/30 pt-2">
        <MenuButton onClick={() => settingsStore.resetKeybindings()} className="w-full">
          {t("settings.resetKeybindings")}
        </MenuButton>
      </div>
    </div>
  );
};

// ── Settings Panel ──────────────────────────────────────────────────────────

export const SettingsPanel = ({ onBack }: SettingsPanelProps): ReactNode => {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("audio");

  // Escape goes back to pause menu
  useEffect(() => {
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        onBack();
      }
    };
    window.addEventListener("keydown", handleKey, true);
    return () => window.removeEventListener("keydown", handleKey, true);
  }, [onBack]);

  return (
    <>
      {/* Header */}
      <div className="mb-4 flex items-center gap-2">
        <button
          onClick={() => {
            playUiSfx("ui_click");
            onBack();
          }}
          className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
          title={t("settings.back")}
        >
          <span className="text-sm">←</span>
        </button>
        <h2 className="text-lg font-semibold text-slate-100">{t("settings.title")}</h2>
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-lg bg-slate-800/60 p-1">
        {(["audio", "keybindings"] as const).map((t_) => (
          <button
            key={t_}
            onClick={() => {
              playUiSfx("ui_click");
              setTab(t_);
            }}
            className={[
              "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t_
                ? "bg-slate-700/80 text-amber-300 shadow-sm"
                : "text-slate-400 hover:text-slate-200",
            ].join(" ")}
          >
            {t_ === "audio" ? t("settings.tabAudio") : t("settings.tabKeybindings")}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="max-h-[50vh] overflow-y-auto pr-1">
        {tab === "audio" && <AudioTab />}
        {tab === "keybindings" && <KeybindingsTab />}
      </div>
    </>
  );
};
