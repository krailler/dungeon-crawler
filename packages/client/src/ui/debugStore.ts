export type DebugSnapshot = {
  fog: boolean;
  wallOcclusion: boolean;
  freeCamera: boolean;
  wireframe: boolean;
};

type DebugKey = keyof DebugSnapshot;
type Listener = () => void;

const listeners = new Set<Listener>();

let state: DebugSnapshot = {
  fog: true,
  wallOcclusion: true,
  freeCamera: false,
  wireframe: false,
};

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
    emit();
  },
};
