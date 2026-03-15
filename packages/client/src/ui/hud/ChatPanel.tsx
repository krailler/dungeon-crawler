import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { chatStore, type ChatMessage } from "../stores/chatStore";
import { authStore } from "../stores/authStore";
import { hudStore } from "../stores/hudStore";
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

// ── Autocomplete mode detection ─────────────────────────────────────────────

type AutocompleteMode =
  | { kind: "commands"; prefix: string }
  | { kind: "players"; cmdName: string; argPrefix: string }
  | null;

/** Check if a command expects a <player> or [player] argument */
function commandExpectsPlayer(cmd: CommandInfo): boolean {
  return /[<[]player[>\]]/.test(cmd.usage.toLowerCase());
}

/**
 * Determine what autocomplete to show based on current input.
 * - "/hel" → commands filtered by "hel"
 * - "/kill ar" → players filtered by "ar" (if /kill expects <player>)
 * - "/players" → commands (no space yet, still completing command name)
 */
function getAutocompleteMode(
  input: string,
  commands: CommandInfo[],
  isAdmin: boolean,
): AutocompleteMode {
  if (!input.startsWith("/")) return null;

  const withoutSlash = input.slice(1);
  const spaceIdx = withoutSlash.indexOf(" ");

  if (spaceIdx === -1) {
    // Still typing command name
    return { kind: "commands", prefix: withoutSlash };
  }

  // Have a space — check if the command expects a player arg
  const cmdName = withoutSlash.slice(0, spaceIdx).toLowerCase();
  const cmd = commands.find((c) => c.name.toLowerCase() === cmdName);

  if (!cmd) return null;
  if (cmd.adminOnly && !isAdmin) return null;

  if (commandExpectsPlayer(cmd)) {
    const argPrefix = withoutSlash
      .slice(spaceIdx + 1)
      .trim()
      .toLowerCase();
    return { kind: "players", cmdName: cmd.name, argPrefix };
  }

  return null;
}

// ── Message row ─────────────────────────────────────────────────────────────

const categoryStyles: Record<string, { wrapper: string; prefix: string }> = {
  player: {
    wrapper: "text-slate-200",
    prefix: "font-semibold",
  },
  message: {
    wrapper: "text-amber-300",
    prefix: "font-semibold",
  },
};

/** Variant overrides for MESSAGE category to change color/label */
const variantStyles: Record<string, { wrapper: string; labelClass: string }> = {
  error: {
    wrapper: "text-red-400",
    labelClass: "text-red-500 mr-1",
  },
  system: {
    wrapper: "text-emerald-400/70",
    labelClass: "",
  },
};

const senderColor = (role?: string): string => {
  if (role === "admin") return "text-amber-400";
  return "text-sky-400";
};

const MessageRow = ({ msg, faded }: { msg: ChatMessage; faded: boolean }): JSX.Element => {
  const { t } = useTranslation();
  const baseStyle = categoryStyles[msg.category] || categoryStyles.player;
  const variant = msg.variant ? variantStyles[msg.variant] : null;

  // Variant overrides wrapper color for command messages
  const wrapperClass = variant ? variant.wrapper : baseStyle.wrapper;

  // Resolve text: use i18n key if available, otherwise fallback to plain text
  const displayText = msg.i18nKey
    ? t(msg.i18nKey, { ...msg.i18nParams, defaultValue: msg.text })
    : msg.text;

  return (
    <div
      className={[
        "px-2 py-0.5 text-[13px] leading-snug transition-opacity duration-500",
        wrapperClass,
        faded ? "opacity-0" : "opacity-100",
      ].join(" ")}
    >
      {msg.category === "player" && msg.sender && (
        <>
          <span className={`${baseStyle.prefix} ${senderColor(msg.senderRole)}`}>{msg.sender}</span>
          <span className="text-slate-500">: </span>
        </>
      )}
      <span className="whitespace-pre-wrap break-words">{displayText}</span>
    </div>
  );
};

// ── Command help overlay ────────────────────────────────────────────────────

const CommandHelpOverlay = ({
  prefix,
  commands,
  isAdmin,
  onSelect,
}: {
  prefix: string;
  commands: CommandInfo[];
  isAdmin: boolean;
  onSelect: (name: string) => void;
}): JSX.Element | null => {
  const filtered = useMemo(() => {
    const lower = prefix.toLowerCase();
    return commands
      .filter((c) => {
        if (c.adminOnly && !isAdmin) return false;
        return c.name.toLowerCase().startsWith(lower);
      })
      .slice(0, 8);
  }, [prefix, commands, isAdmin]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-slate-600/40 bg-slate-900/95 backdrop-blur-sm p-2 shadow-xl">
      {filtered.map((cmd) => (
        <div
          key={cmd.name}
          className="flex items-center gap-2 px-2 py-1 text-[12px] cursor-pointer rounded hover:bg-slate-800/60 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent blur
            onSelect(cmd.name);
          }}
        >
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

// ── Player suggestion overlay ───────────────────────────────────────────────

const PlayerSuggestOverlay = ({
  cmdName,
  argPrefix,
  playerNames,
  onSelect,
}: {
  cmdName: string;
  argPrefix: string;
  playerNames: string[];
  onSelect: (name: string) => void;
}): JSX.Element | null => {
  const filtered = useMemo(() => {
    const lower = argPrefix.toLowerCase();
    return playerNames.filter((n) => n.toLowerCase().startsWith(lower)).slice(0, 8);
  }, [argPrefix, playerNames]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-slate-600/40 bg-slate-900/95 backdrop-blur-sm p-2 shadow-xl">
      <div className="px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500 mb-1">
        /{cmdName} &mdash; select player
      </div>
      {filtered.map((name) => (
        <div
          key={name}
          className="flex items-center gap-2 px-2 py-1.5 text-[12px] cursor-pointer rounded hover:bg-slate-800/60 transition-colors"
          onMouseDown={(e) => {
            e.preventDefault(); // Prevent blur
            onSelect(name);
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-3.5 w-3.5 text-sky-400/70"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
              clipRule="evenodd"
            />
          </svg>
          <span className="text-slate-200">{name}</span>
        </div>
      ))}
    </div>
  );
};

// ── ChatPanel ───────────────────────────────────────────────────────────────

/** Max number of sent messages to remember */
const HISTORY_MAX = 50;

export const ChatPanel = (): JSX.Element => {
  const snapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
  const authSnapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const hudSnapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const isAdmin = authSnapshot.role === "admin";
  const [inputValue, setInputValue] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  // Chat history (arrow up/down navigation)
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");

  // Player names from HUD store
  const playerNames = useMemo(() => hudSnapshot.members.map((m) => m.name), [hudSnapshot.members]);

  // Determine autocomplete mode
  const acMode = useMemo(
    () => getAutocompleteMode(inputValue, snapshot.commands, isAdmin),
    [inputValue, snapshot.commands, isAdmin],
  );

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

  // Select a command from the overlay
  const selectCommand = useCallback((name: string) => {
    setInputValue(`/${name} `);
    inputRef.current?.focus();
  }, []);

  // Select a player from the overlay
  const selectPlayer = useCallback(
    (name: string) => {
      if (!acMode || acMode.kind !== "players") return;
      setInputValue(`/${acMode.cmdName} ${name} `);
      inputRef.current?.focus();
    },
    [acMode],
  );

  const handleSend = useCallback(() => {
    const text = inputValue.trim();
    if (text && sendChatFn) {
      sendChatFn(text);
      // Push to history (avoid duplicating the last entry)
      const history = historyRef.current;
      if (history.length === 0 || history[history.length - 1] !== text) {
        history.push(text);
        if (history.length > HISTORY_MAX) history.shift();
      }
    }
    historyIndexRef.current = -1;
    draftRef.current = "";
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
      } else if (e.key === "ArrowUp") {
        const history = historyRef.current;
        if (history.length === 0) return;
        e.preventDefault();
        if (historyIndexRef.current === -1) {
          // Save current draft before navigating
          draftRef.current = inputValue;
          historyIndexRef.current = history.length - 1;
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
        }
        setInputValue(history[historyIndexRef.current]);
      } else if (e.key === "ArrowDown") {
        if (historyIndexRef.current === -1) return;
        e.preventDefault();
        const history = historyRef.current;
        if (historyIndexRef.current < history.length - 1) {
          historyIndexRef.current++;
          setInputValue(history[historyIndexRef.current]);
        } else {
          // Past the end — restore draft
          historyIndexRef.current = -1;
          setInputValue(draftRef.current);
        }
      } else if (e.key === "Tab") {
        e.preventDefault();

        if (!acMode) return;

        if (acMode.kind === "commands") {
          // Tab autocomplete command name
          const match = snapshot.commands.find((c) => {
            if (c.adminOnly && !isAdmin) return false;
            return c.name.toLowerCase().startsWith(acMode.prefix.toLowerCase());
          });
          if (match) {
            setInputValue(`/${match.name} `);
          }
        } else if (acMode.kind === "players") {
          // Tab autocomplete player name — cycle through matches
          const lower = acMode.argPrefix.toLowerCase();
          const matches = playerNames.filter((n) => n.toLowerCase().startsWith(lower));
          if (matches.length === 0) return;

          // Find current match and cycle to next
          const currentArg = inputValue.slice(inputValue.indexOf(" ") + 1).trim();
          const currentIdx = matches.findIndex((n) => n.toLowerCase() === currentArg.toLowerCase());
          const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % matches.length;
          setInputValue(`/${acMode.cmdName} ${matches[nextIdx]}`);
        }
      }
    },
    [handleSend, inputValue, snapshot.commands, isAdmin, acMode, playerNames],
  );

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
          {acMode?.kind === "commands" && (
            <CommandHelpOverlay
              prefix={acMode.prefix}
              commands={snapshot.commands}
              isAdmin={isAdmin}
              onSelect={selectCommand}
            />
          )}
          {acMode?.kind === "players" && (
            <PlayerSuggestOverlay
              cmdName={acMode.cmdName}
              argPrefix={acMode.argPrefix}
              playerNames={playerNames}
              onSelect={selectPlayer}
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
