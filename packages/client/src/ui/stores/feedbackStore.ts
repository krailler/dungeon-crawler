type Listener = () => void;

type FeedbackEntry = {
  id: number;
  i18nKey: string;
};

const listeners = new Set<Listener>();
let entries: FeedbackEntry[] = [];
let nextId = 0;
const DURATION = 1500; // ms before auto-removal

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
    setTimeout(() => {
      entries = entries.filter((e) => e.id !== id);
      emit();
    }, DURATION);
  },
  reset(): void {
    entries = [];
    emit();
  },
};
