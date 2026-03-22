import type { DungeonSummaryMessage } from "@dungeon/shared";

export type DungeonSummary = DungeonSummaryMessage;

export type DungeonSummarySnapshot = {
  visible: boolean;
  summary: DungeonSummary | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let visible = false;
let summary: DungeonSummary | null = null;
let cachedSnapshot: DungeonSummarySnapshot = { visible: false, summary: null };

function rebuild(): void {
  cachedSnapshot = { visible, summary };
}

function emit(): void {
  rebuild();
  for (const fn of listeners) fn();
}

export const dungeonSummaryStore = {
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): DungeonSummarySnapshot {
    return cachedSnapshot;
  },

  /** Store summary data without showing (called during dungeon countdown). */
  store(data: DungeonSummary): void {
    summary = data;
  },

  /** Show the stored summary (called when returning to lobby). */
  show(): void {
    if (!summary) return;
    visible = true;
    emit();
  },

  dismiss(): void {
    visible = false;
    emit();
  },

  reset(): void {
    visible = false;
    summary = null;
    emit();
  },
};
