import { CHAT_MAX_HISTORY } from "@dungeon/shared";
import type { ChatCategoryValue, CommandInfo, ChatEntry } from "@dungeon/shared";

export type ChatMessage = {
  id: number;
  category: ChatCategoryValue;
  timestamp: number;
  sender?: string;
  senderRole?: string;
  text: string;
};

export type ChatSnapshot = {
  messages: ChatMessage[];
  inputOpen: boolean;
  commands: CommandInfo[];
};

type Listener = () => void;

const listeners = new Set<Listener>();
let messages: ChatMessage[] = [];
let inputOpen = false;
let commands: CommandInfo[] = [];

let cachedSnapshot: ChatSnapshot = {
  messages: [],
  inputOpen: false,
  commands: [],
};

const rebuildSnapshot = (): void => {
  cachedSnapshot = {
    messages,
    inputOpen,
    commands,
  };
};

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const chatStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ChatSnapshot {
    return cachedSnapshot;
  },
  addMessage(entry: ChatEntry): void {
    const msg: ChatMessage = {
      id: entry.id,
      category: entry.category,
      timestamp: entry.timestamp,
      sender: entry.sender,
      senderRole: entry.senderRole,
      text: entry.text,
    };
    messages = [...messages, msg];
    if (messages.length > CHAT_MAX_HISTORY) {
      messages = messages.slice(messages.length - CHAT_MAX_HISTORY);
    }
    rebuildSnapshot();
    emit();
  },
  setInputOpen(open: boolean): void {
    if (inputOpen === open) return;
    inputOpen = open;
    rebuildSnapshot();
    emit();
  },
  setCommands(cmds: CommandInfo[]): void {
    commands = cmds;
    rebuildSnapshot();
    emit();
  },
  reset(): void {
    messages = [];
    inputOpen = false;
    commands = [];
    rebuildSnapshot();
    emit();
  },
};
