type Listener = () => void;

type FeedbackEntry = {
  id: number;
  i18nKey: string;
};

const listeners = new Set<Listener>();
let entries: FeedbackEntry[] = [];
let nextId = 0;
const DURATION = 1500; // ms before auto-removal
const activeTimers = new Set<ReturnType<typeof setTimeout>>();

const emit = (): void => {
  for (const listener of listeners) listener();
};

export const feedbackStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): FeedbackEntry[] {
    return entries;
  },
  push(i18nKey: string): void {
    const id = ++nextId;
    entries = [...entries, { id, i18nKey }];
    emit();
    const timer = setTimeout(() => {
      activeTimers.delete(timer);
      entries = entries.filter((e) => e.id !== id);
      emit();
    }, DURATION);
    activeTimers.add(timer);
  },
  reset(): void {
    for (const t of activeTimers) clearTimeout(t);
    activeTimers.clear();
    entries = [];
    emit();
  },
};
