type Listener = () => void;

export type CreatureEffectData = {
  effectId: string;
  remaining: number;
  duration: number;
  stacks: number;
  modValue: number;
};

export type CreatureData = {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  level: number;
  isDead: boolean;
  effects?: CreatureEffectData[];
};

type CreatureMap = Map<string, CreatureData>;

const listeners = new Set<Listener>();
const creatures: CreatureMap = new Map();

/** Cached snapshot — rebuilt on every mutation */
let cachedSnapshot: CreatureMap = new Map();

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const creatureStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): CreatureMap {
    return cachedSnapshot;
  },

  /** Get a single creature by id (avoids full snapshot copy). */
  get(id: string): CreatureData | undefined {
    return creatures.get(id);
  },

  set(id: string, data: CreatureData): void {
    creatures.set(id, data);
    cachedSnapshot = new Map(creatures);
    emit();
  },

  update(id: string, patch: Partial<CreatureData>): void {
    const existing = creatures.get(id);
    if (!existing) return;
    creatures.set(id, { ...existing, ...patch });
    cachedSnapshot = new Map(creatures);
    emit();
  },

  remove(id: string): void {
    if (!creatures.has(id)) return;
    creatures.delete(id);
    cachedSnapshot = new Map(creatures);
    emit();
  },

  reset(): void {
    creatures.clear();
    cachedSnapshot = new Map();
    emit();
  },
};
