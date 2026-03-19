type Listener = () => void;

type LevelUpSnapshot = {
  visible: boolean;
  level: number;
};

const listeners = new Set<Listener>();
let snapshot: LevelUpSnapshot = { visible: false, level: 0 };

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const levelUpStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): LevelUpSnapshot {
    return snapshot;
  },

  show(level: number): void {
    snapshot = { visible: true, level };
    emit();
  },

  hide(): void {
    snapshot = { visible: false, level: 0 };
    emit();
  },
};
