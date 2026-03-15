export type DebugSnapshot = {
  fog: boolean;
  wallOcclusion: boolean;
  freeCamera: boolean;
  wireframe: boolean;
  ambient: boolean;
  combatLog: boolean;
  showPaths: boolean;
};

type DebugKey = keyof DebugSnapshot;
type Listener = () => void;

const STORAGE_KEY = "dungeon_debug";

const DEFAULTS: DebugSnapshot = {
  fog: true,
  wallOcclusion: true,
  freeCamera: false,
  wireframe: false,
  ambient: true,
  combatLog: false,
  showPaths: false,
};

const listeners = new Set<Listener>();

/** Load saved state from localStorage, falling back to defaults */
const loadState = (): DebugSnapshot => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<DebugSnapshot>;
      return { ...DEFAULTS, ...saved };
    }
  } catch {
    // Corrupt or unavailable localStorage — use defaults
  }
  return { ...DEFAULTS };
};

const saveState = (s: DebugSnapshot): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // Storage full or unavailable — silently ignore
  }
};

let state: DebugSnapshot = loadState();

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const debugStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): DebugSnapshot {
    return state;
  },
  toggle(key: DebugKey): void {
    state = { ...state, [key]: !state[key] };
    saveState(state);
    emit();
  },
  resetAll(): void {
    state = { ...DEFAULTS };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
    emit();
  },
};
