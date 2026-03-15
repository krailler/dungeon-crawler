type PromptConfig = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
};

type PromptSnapshot = {
  /** The current prompt to display, or null if none */
  current: PromptConfig | null;
};

type Listener = () => void;

const listeners = new Set<Listener>();

let snapshot: PromptSnapshot = { current: null };

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const promptStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): PromptSnapshot {
    return snapshot;
  },

  /** Show a confirmation prompt. Only one prompt at a time. */
  show(config: PromptConfig): void {
    snapshot = { current: config };
    emit();
  },

  /** Hide the current prompt */
  hide(): void {
    if (!snapshot.current) return;
    snapshot = { current: null };
    emit();
  },

  reset(): void {
    snapshot = { current: null };
    emit();
  },
};
