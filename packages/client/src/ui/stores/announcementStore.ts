import { ANNOUNCEMENT_FADE_MS } from "@dungeon/shared";

export type Announcement = {
  id: number;
  text: string;
  i18nKey?: string;
  i18nParams?: Record<string, string | number>;
  /** Optional visual variant (e.g. "error" for red text) */
  variant?: string;
  /** Timestamp when the announcement was added (for fade timing) */
  addedAt: number;
};

export type AnnouncementSnapshot = {
  current: Announcement | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let current: Announcement | null = null;
let fadeTimer: ReturnType<typeof setTimeout> | null = null;

let cachedSnapshot: AnnouncementSnapshot = { current: null };

const rebuildSnapshot = (): void => {
  cachedSnapshot = { current };
};

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const announcementStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): AnnouncementSnapshot {
    return cachedSnapshot;
  },
  push(entry: {
    id: number;
    text: string;
    i18nKey?: string;
    i18nParams?: Record<string, string | number>;
    variant?: string;
  }): void {
    // Clear previous fade timer
    if (fadeTimer !== null) {
      clearTimeout(fadeTimer);
    }

    current = {
      id: entry.id,
      text: entry.text,
      i18nKey: entry.i18nKey,
      i18nParams: entry.i18nParams,
      variant: entry.variant,
      addedAt: Date.now(),
    };
    rebuildSnapshot();
    emit();

    // Auto-clear after fade duration
    fadeTimer = setTimeout(() => {
      current = null;
      fadeTimer = null;
      rebuildSnapshot();
      emit();
    }, ANNOUNCEMENT_FADE_MS);
  },
  reset(): void {
    if (fadeTimer !== null) {
      clearTimeout(fadeTimer);
      fadeTimer = null;
    }
    current = null;
    rebuildSnapshot();
    emit();
  },
};
