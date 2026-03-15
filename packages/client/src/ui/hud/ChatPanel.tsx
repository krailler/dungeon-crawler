import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { chatStore, type ChatMessage } from "../stores/chatStore";
import { authStore } from "../stores/authStore";
import { CHAT_FADE_MS } from "@dungeon/shared";
import type { CommandInfo } from "@dungeon/shared";

// ── Send callback (set from ClientGame) ─────────────────────────────────────

let sendChatFn: ((text: string) => void) | null = null;

export function setChatSendFn(fn: (text: string) => void): void {
  sendChatFn = fn;
}

export function clearChatSendFn(): void {
  sendChatFn = null;
}

// ── Message row ─────────────────────────────────────────────────────────────

const categoryStyles: Record<string, { wrapper: string; prefix: string }> = {
  player: {
    wrapper: "text-slate-200",
    prefix: "font-semibold",
  },
  system: {
    wrapper: "text-emerald-400/70",
    prefix: "",
  },
  command: {
    wrapper: "text-amber-300",
    prefix: "font-semibold",
  },
  error: {
    wrapper: "text-red-400",
    prefix: "font-semibold",
  },
};

const senderColor = (role?: string): string => {
  if (role === "admin") return "text-amber-400";
  return "text-sky-400";
};

const MessageRow = ({ msg, faded }: { msg: ChatMessage; faded: boolean }): JSX.Element => {
  const style = categoryStyles[msg.category] || categoryStyles.player;

  return (
    <div
      className={[
        "px-2 py-0.5 text-[13px] leading-snug transition-opacity duration-500",
        style.wrapper,
        faded ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      {msg.category === "player" && msg.sender && (
        <>
          <span className={`${style.prefix} ${senderColor(msg.senderRole)}`}>{msg.sender}</span>
          <span className="text-slate-500">: </span>
        </>
      )}
      {msg.category === "command" && <span className="text-amber-500 mr-1">[Server] </span>}
      {msg.category === "error" && <span className="text-red-500 mr-1">[Error] </span>}
      <span className="whitespace-pre-wrap break-words">{msg.text}</span>
    </div>
  );
};

// ── Command help overlay ────────────────────────────────────────────────────

const CommandHelpOverlay = ({
  filter,
  commands,
  isAdmin,
}: {
  filter: string;
  commands: CommandInfo[];
  isAdmin: boolean;
}): JSX.Element | null => {
  const filtered = useMemo(() => {
    const prefix = filter.slice(1).toLowerCase(); // remove leading "/"
    return commands
      .filter((c) => {
        if (c.adminOnly && !isAdmin) return false;
        return c.name.toLowerCase().startsWith(prefix);
      })
      .slice(0, 8);
  }, [filter, commands, isAdmin]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-slate-600/40 bg-slate-900/95 backdrop-blur-sm p-2 shadow-xl">
      {filtered.map((cmd) => (
        <div key={cmd.name} className="flex items-center gap-2 px-2 py-1 text-[12px]">
          <span className="font-mono text-sky-400">{cmd.usage}</span>
          <span className="text-slate-500">&mdash;</span>
          <span className="text-slate-400">{cmd.description}</span>
          {cmd.adminOnly && (
            <span className="ml-auto rounded bg-amber-900/50 px-1 py-0.5 text-[10px] text-amber-400 font-medium">
              ADMIN
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// ── ChatPanel ───────────────────────────────────────────────────────────────

export const ChatPanel = (): JSX.Element => {
  const snapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
  const authSnapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const isAdmin = authSnapshot.role === "admin";
  const [inputValue, setInputValue] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  // Refresh "now" every second for fade calculation
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [snapshot.messages]);

  // Focus input when opened
  useEffect(() => {
    if (snapshot.inputOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [snapshot.inputOpen]);

  // Global Enter key to open input
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't intercept if already typing in our input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Enter") {
        e.preventDefault();
        chatStore.setInputOpen(true);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (text && sendChatFn) {
      sendChatFn(text);
    }
    setInputValue("");
    chatStore.setInputOpen(false);
  }, [inputValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation(); // Prevent game keybinds (C, M, Escape, etc.)

      if (e.key === "Enter") {
        handleSend();
      } else if (e.key === "Escape") {
        setInputValue("");
        chatStore.setInputOpen(false);
      } else if (e.key === "Tab") {
        // Tab autocomplete for commands
        if (inputValue.startsWith("/")) {
          e.preventDefault();
          const prefix = inputValue.slice(1).toLowerCase();
          const match = snapshot.commands.find((c) => {
            if (c.adminOnly && !isAdmin) return false;
            return c.name.toLowerCase().startsWith(prefix);
          });
          if (match) {
            setInputValue(`/${match.name} `);
          }
        }
      }
    },
    [handleSend, inputValue, snapshot.commands, isAdmin],
  );

  const showHelp = snapshot.inputOpen && inputValue.startsWith("/");

  return (
    <div
      className="pointer-events-auto absolute bottom-5 left-5 w-96 flex flex-col"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Message list */}
      <div
        ref={scrollRef}
        className={[
          "max-h-60 overflow-y-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-slate-700/50",
          "rounded-t-lg transition-colors duration-200",
          isHovered || snapshot.inputOpen ? "bg-slate-900/80 backdrop-blur-sm" : "bg-transparent",
        ].join(" ")}
      >
        {snapshot.messages.map((msg) => {
          const age = now - msg.timestamp;
          const faded = !isHovered && !snapshot.inputOpen && age > CHAT_FADE_MS;
          return <MessageRow key={msg.id} msg={msg} faded={faded} />;
        })}
      </div>

      {/* Input area */}
      {snapshot.inputOpen && (
        <div className="relative">
          {showHelp && (
            <CommandHelpOverlay
              filter={inputValue}
              commands={snapshot.commands}
              isAdmin={isAdmin}
            />
          )}
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Small delay to allow click on help overlay
              setTimeout(() => {
                if (!inputRef.current || document.activeElement !== inputRef.current) {
                  chatStore.setInputOpen(false);
                  setInputValue("");
                }
              }, 150);
            }}
            placeholder="Type a message or /command..."
            maxLength={200}
            className="w-full rounded-b-lg border border-slate-600/40 bg-slate-900/90 px-3 py-2 text-[13px] text-slate-200 placeholder-slate-500 outline-none backdrop-blur-sm focus:border-sky-500/50"
          />
        </div>
      )}

      {/* Hint when chat is not open */}
      {!snapshot.inputOpen && snapshot.messages.length === 0 && (
        <div className="px-2 py-1 text-[11px] text-slate-600">
          Press{" "}
          <kbd className="rounded bg-slate-800/60 px-1 py-0.5 text-[10px] font-mono text-slate-500">
            Enter
          </kbd>{" "}
          to chat
        </div>
      )}
    </div>
  );
};
