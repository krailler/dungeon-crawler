// ── Bindable actions ────────────────────────────────────────────────────────

export const BindableAction = {
  SPRINT: "sprint",
  CHAT: "chat",
  SKILL_1: "skill_1",
  SKILL_2: "skill_2",
  SKILL_3: "skill_3",
  SKILL_4: "skill_4",
  SKILL_5: "skill_5",
  CONSUMABLE_1: "consumable_1",
  CONSUMABLE_2: "consumable_2",
  CONSUMABLE_3: "consumable_3",
  CONSUMABLE_4: "consumable_4",
  CHARACTER: "character",
  INVENTORY: "inventory",
  TALENTS: "talents",
  SPELLBOOK: "spellbook",
  MINIMAP: "minimap",
  INTERACT: "interact",
  FULLSCREEN: "fullscreen",
  TAB_TARGET: "tabTarget",
  REVIVE: "revive",
} as const;

export type BindableActionValue = (typeof BindableAction)[keyof typeof BindableAction];

// ── Settings types ──────────────────────────────────────────────────────────

export type VolumeSettings = {
  master: number;
  sfx: number;
  ambient: number;
  ui: number;
};

export type KeybindingSettings = Record<BindableActionValue, string>;

export const ShadowQuality = {
  LOW: 512,
  MEDIUM: 1024,
  HIGH: 2048,
} as const;

export type ShadowQualityValue = (typeof ShadowQuality)[keyof typeof ShadowQuality];

export type GraphicsSettings = {
  shadows: boolean;
  shadowQuality: ShadowQualityValue;
  particles: boolean;
  glow: boolean;
  antiAliasing: boolean;
  fxaa: boolean;
  sharpen: boolean;
  hiDpi: boolean;
  resolutionScale: number; // 0.5 to 1.0
  showPerformance: boolean;
};

export type SettingsSnapshot = {
  volume: VolumeSettings;
  keybindings: KeybindingSettings;
  graphics: GraphicsSettings;
};

// ── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_VOLUME: VolumeSettings = {
  master: 1.0,
  sfx: 0.6,
  ambient: 1.0,
  ui: 1.0,
};

const DEFAULT_KEYBINDINGS: KeybindingSettings = {
  sprint: "Shift",
  chat: "Enter",
  skill_1: "q",
  skill_2: "w",
  skill_3: "e",
  skill_4: "r",
  skill_5: "t",
  consumable_1: "1",
  consumable_2: "2",
  consumable_3: "3",
  consumable_4: "4",
  character: "c",
  inventory: "b",
  talents: "n",
  spellbook: "h",
  minimap: "m",
  interact: "f",
  fullscreen: "F11",
  tabTarget: "Tab",
  revive: "r",
};

const DEFAULT_GRAPHICS: GraphicsSettings = {
  shadows: true,
  shadowQuality: ShadowQuality.MEDIUM,
  particles: true,
  glow: true,
  antiAliasing: true,
  fxaa: false,
  sharpen: true,
  hiDpi: true,
  resolutionScale: 1.0,
  showPerformance: true,
};

// ── Persistence ─────────────────────────────────────────────────────────────

const STORAGE_KEY = "dungeon_settings";

type Listener = () => void;

const listeners = new Set<Listener>();

const loadState = (): SettingsSnapshot => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<SettingsSnapshot>;
      return {
        volume: { ...DEFAULT_VOLUME, ...(saved.volume ?? {}) },
        keybindings: { ...DEFAULT_KEYBINDINGS, ...(saved.keybindings ?? {}) },
        graphics: { ...DEFAULT_GRAPHICS, ...((saved as any).graphics ?? {}) },
      };
    }
  } catch {
    // Corrupt or unavailable localStorage — use defaults
  }
  return {
    volume: { ...DEFAULT_VOLUME },
    keybindings: { ...DEFAULT_KEYBINDINGS },
    graphics: { ...DEFAULT_GRAPHICS },
  };
};

const saveState = (s: SettingsSnapshot): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage full or unavailable — silently ignore
  }
};

let state: SettingsSnapshot = loadState();

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

// ── Key display names ───────────────────────────────────────────────────────

const KEY_DISPLAY: Record<string, string> = {
  " ": "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Control: "Ctrl",
  Escape: "Esc",
};

export function displayKeyName(key: string): string {
  return KEY_DISPLAY[key] ?? (key.length === 1 ? key.toUpperCase() : key);
}

// ── Store ───────────────────────────────────────────────────────────────────

export const settingsStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): SettingsSnapshot {
    return state;
  },

  // Volume
  setVolume(key: keyof VolumeSettings, value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    if (state.volume[key] === clamped) return;
    state = { ...state, volume: { ...state.volume, [key]: clamped } };
    saveState(state);
    emit();
  },

  // Keybindings
  setKeybinding(action: BindableActionValue, key: string): void {
    if (state.keybindings[action] === key) return;

    const newBindings = { ...state.keybindings };

    // Conflict detection: find other action with this key and swap
    for (const [otherAction, otherKey] of Object.entries(newBindings)) {
      if (otherAction !== action && otherKey === key) {
        newBindings[otherAction as BindableActionValue] = state.keybindings[action];
        break;
      }
    }

    newBindings[action] = key;
    state = { ...state, keybindings: newBindings };
    saveState(state);
    emit();
  },

  resetVolume(): void {
    state = { ...state, volume: { ...DEFAULT_VOLUME } };
    saveState(state);
    emit();
  },

  resetKeybindings(): void {
    state = { ...state, keybindings: { ...DEFAULT_KEYBINDINGS } };
    saveState(state);
    emit();
  },

  // Graphics
  setGraphics<K extends keyof GraphicsSettings>(key: K, value: GraphicsSettings[K]): void {
    if (state.graphics[key] === value) return;
    state = { ...state, graphics: { ...state.graphics, [key]: value } };
    saveState(state);
    emit();
  },

  resetGraphics(): void {
    state = { ...state, graphics: { ...DEFAULT_GRAPHICS } };
    saveState(state);
    emit();
  },

  resetAll(): void {
    state = {
      volume: { ...DEFAULT_VOLUME },
      keybindings: { ...DEFAULT_KEYBINDINGS },
      graphics: { ...DEFAULT_GRAPHICS },
    };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    emit();
  },

  /** Convenience: read a single binding */
  getBinding(action: BindableActionValue): string {
    return state.keybindings[action];
  },
};
