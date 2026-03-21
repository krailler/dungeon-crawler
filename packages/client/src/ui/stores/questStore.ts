import type { QuestTypeValue, QuestStatusValue } from "@dungeon/shared";

export type QuestEntry = {
  id: string;
  questType: QuestTypeValue;
  i18nKey: string;
  target: number;
  progress: number;
  status: QuestStatusValue;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let quests = new Map<string, QuestEntry>();
let cachedSnapshot = new Map<string, QuestEntry>();

function emit(): void {
  cachedSnapshot = new Map(quests);
  for (const fn of listeners) fn();
}

export const questStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): ReadonlyMap<string, QuestEntry> {
    return cachedSnapshot;
  },

  /** Called from StateSync when a quest is added or updated. */
  setQuest(id: string, entry: QuestEntry): void {
    quests.set(id, entry);
    emit();
  },

  /** Called from StateSync when a quest is removed. */
  removeQuest(id: string): void {
    quests.delete(id);
    emit();
  },

  reset(): void {
    quests = new Map();
    cachedSnapshot = new Map();
    emit();
  },
};
