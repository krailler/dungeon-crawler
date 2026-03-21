import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { chatStore, type ChatMessage } from "../stores/chatStore";
import { authStore } from "../stores/authStore";
import { hudStore } from "../stores/hudStore";
import { itemDefStore } from "../stores/itemDefStore";
import { itemInstanceStore } from "../stores/itemInstanceStore";
import { ItemIcon } from "../components/ItemIcon";
import { CHAT_FADE_MS } from "@dungeon/shared";
import type { CommandInfo } from "@dungeon/shared";
import { settingsStore } from "../stores/settingsStore";
import { playUiSfx } from "../../audio/uiSfx";
import { t as tFn } from "../../i18n/i18n";
import {
  ITEM_LINK_RE,
  chatSend,
  setInsertItemLinkFn,
  clearInsertItemLinkFn,
} from "./itemLinkUtils";
import { getRarityStyle } from "../utils/rarityColors";
import { STAT_I18N, formatStatValue, formatStatRange } from "../utils/statLabels";

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

/** Parse text and replace [item:id] / [item:id:instanceId] with ReactNode item links */
function parseItemLinks(
  text: string,
  onClickLink: (itemId: string, instanceId: string | undefined, rect: DOMRect) => void,
): ReactNode[] {
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  ITEM_LINK_RE.lastIndex = 0;

  while ((match = ITEM_LINK_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const itemId = match[1];
    const instanceId = match[2] || undefined;
    parts.push(
      <ItemLinkSpan
        key={`${itemId}_${match.index}`}
        itemId={itemId}
        instanceId={instanceId}
        onClick={onClickLink}
      />,
    );
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

/** Inline item link rendered in chat messages */
const ItemLinkSpan = ({
  itemId,
  instanceId,
  onClick,
}: {
  itemId: string;
  instanceId?: string;
  onClick: (itemId: string, instanceId: string | undefined, rect: DOMRect) => void;
}): ReactNode => {
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);
  const def = itemDefs.get(itemId);
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    itemDefStore.ensureLoaded([itemId]);
  }, [itemId]);

  const { t } = useTranslation();
  const colorClass = def ? getRarityStyle(def.rarity).text : "text-slate-400";
  const displayName = def ? t(def.name, { defaultValue: def.name }) : itemId;

  return (
    <span
      ref={spanRef}
      className={`cursor-pointer font-semibold hover:underline ${colorClass}`}
      onClick={(e) => {
        e.stopPropagation();
        playUiSfx("ui_click");
        const rect = spanRef.current?.getBoundingClientRect();
        if (rect) onClick(itemId, instanceId, rect);
      }}
    >
      [{displayName}]
    </span>
  );
};

// ── Item link tooltip popup ──────────────────────────────────────────────────

const ItemLinkTooltip = ({
  itemId,
  instanceId,
  anchorRect,
  onClose,
}: {
  itemId: string;
  instanceId?: string;
  anchorRect: DOMRect;
  onClose: () => void;
}): ReactNode => {
  const { t } = useTranslation();
  const itemDefs = useSyncExternalStore(itemDefStore.subscribe, itemDefStore.getSnapshot);
  const instances = useSyncExternalStore(
    itemInstanceStore.subscribe,
    itemInstanceStore.getSnapshot,
  );
  const def = itemDefs.get(itemId);
  const instance = instanceId ? instances.get(instanceId) : undefined;
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Lazy-load instance data
  useEffect(() => {
    if (instanceId) itemInstanceStore.ensureLoaded([instanceId]);
  }, [instanceId]);

  useEffect(() => {
    const handleClick = (e: MouseEvent): void => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    const timer = setTimeout(() => {
      document.addEventListener("click", handleClick);
    }, 0);
    document.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  if (!def) return null;

  const rarityColor = getRarityStyle(def.rarity).text;
  const style: React.CSSProperties = {
    left: anchorRect.left,
    bottom: window.innerHeight - anchorRect.top + 4,
  };

  const isEquipment = !!def.equipSlot;
  const slotLabelKey = def.equipSlot ? `equipment.${def.equipSlot.replace(/_\d+$/, "")}` : "";

  // Use instance rolled stats if available, otherwise show template ranges
  const hasInstance = isEquipment && instance;
  const rolledStats = hasInstance ? Object.entries(instance.rolledStats) : [];
  const rangeStats = isEquipment && !hasInstance ? Object.entries(def.statRanges ?? {}) : [];

  return (
    <div
      ref={tooltipRef}
      className="pointer-events-auto fixed z-[400] w-56 rounded-lg border border-slate-600/50 bg-slate-900/95 p-3 shadow-xl backdrop-blur"
      style={style}
    >
      <div className="flex items-center gap-2">
        {def.icon && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-slate-600/40 bg-slate-800/80">
            <ItemIcon iconId={def.icon} />
          </div>
        )}
        <div>
          <div className={`text-sm font-bold ${rarityColor}`}>
            {t(def.name, { defaultValue: def.name })}
          </div>
          {isEquipment ? (
            <div className="text-[10px] text-slate-500">
              {t(slotLabelKey)}
              {hasInstance && ` · ${t("equipment.itemLevel", { level: instance.itemLevel })}`}
              {def.levelReq > 1 && ` · ${t("equipment.levelReq", { level: def.levelReq })}`}
            </div>
          ) : (
            def.rarity &&
            def.rarity !== "common" && (
              <div className="text-[10px] capitalize text-slate-500">{def.rarity}</div>
            )
          )}
        </div>
      </div>
      {rolledStats.length > 0 ? (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {rolledStats.map(([stat, value]) => (
            <div key={stat} className="text-[11px] text-emerald-400">
              {formatStatValue(stat, value)} {t(STAT_I18N[stat] ?? stat)}
            </div>
          ))}
        </div>
      ) : rangeStats.length > 0 ? (
        <div className="mt-1.5 flex flex-col gap-0.5">
          {rangeStats.map(([stat, range]) => (
            <div key={stat} className="text-[11px] text-emerald-400">
              {formatStatRange(stat, range.min, range.max)} {t(STAT_I18N[stat] ?? stat)}
            </div>
          ))}
        </div>
      ) : (
        def.description && (
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">
            {t(def.description, { ...def.effectParams, defaultValue: def.description })}
          </p>
        )
      )}
    </div>
  );
};

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

const MessageRow = ({
  msg,
  faded,
  onClickLink,
}: {
  msg: ChatMessage;
  faded: boolean;
  onClickLink: (itemId: string, instanceId: string | undefined, rect: DOMRect) => void;
}): ReactNode => {
  const { t } = useTranslation();
  const baseStyle = categoryStyles[msg.category] || categoryStyles.player;
  const variant = msg.variant ? variantStyles[msg.variant] : null;

  // Variant overrides wrapper color for command messages
  const wrapperClass = variant ? variant.wrapper : baseStyle.wrapper;

  // Resolve text: use i18n key if available, otherwise fallback to plain text
  const displayText = msg.i18nKey
    ? t(msg.i18nKey, { ...(msg.i18nParams ?? {}), defaultValue: msg.text })
    : msg.text;

  // Check if text contains item links
  const hasLinks = ITEM_LINK_RE.test(displayText);
  ITEM_LINK_RE.lastIndex = 0;

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
      <span className="whitespace-pre-wrap break-words">
        {hasLinks ? parseItemLinks(displayText, onClickLink) : displayText}
      </span>
    </div>
  );
};

// ── Command help overlay ────────────────────────────────────────────────────

/** Filter commands for autocomplete (shared between overlay and ChatPanel) */
function filterCommands(commands: CommandInfo[], prefix: string, isAdmin: boolean): CommandInfo[] {
  const lower = prefix.toLowerCase();
  return commands
    .filter((c) => {
      if (c.adminOnly && !isAdmin) return false;
      return c.name.toLowerCase().startsWith(lower);
    })
    .slice(0, 8);
}

const CommandHelpOverlay = ({
  commands,
  selectedIndex,
  onSelect,
}: {
  commands: CommandInfo[];
  selectedIndex: number;
  onSelect: (name: string) => void;
}): ReactNode => {
  if (commands.length === 0) return null;

  const selected = commands[selectedIndex] ?? commands[0];

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-slate-600/40 bg-slate-900/95 backdrop-blur-sm shadow-xl">
      {/* Detail panel for the selected command */}
      <div className="border-b border-slate-700/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[13px] text-sky-400">{selected.usage}</span>
          {selected.adminOnly && (
            <span className="rounded bg-amber-900/50 px-1 py-0.5 text-[10px] text-amber-400 font-medium">
              ADMIN
            </span>
          )}
        </div>
        <div className="mt-0.5 text-[11px] text-slate-400">{selected.description}</div>
      </div>
      {/* Compact command list */}
      <div className="p-1">
        {commands.map((cmd, i) => (
          <div
            key={cmd.name}
            className={[
              "flex items-center gap-2 px-2 py-1 text-[12px] cursor-pointer rounded transition-colors",
              i === selectedIndex
                ? "bg-slate-700/50 text-slate-100"
                : "text-slate-400 hover:bg-slate-800/60",
            ].join(" ")}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(cmd.name);
            }}
          >
            <span className="font-mono text-sky-400">/{cmd.name}</span>
            {cmd.adminOnly && (
              <span className="rounded bg-amber-900/50 px-1 py-0.5 text-[10px] text-amber-400 font-medium">
                ADMIN
              </span>
            )}
          </div>
        ))}
      </div>
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
}): ReactNode => {
  const { t } = useTranslation();
  const filtered = useMemo(() => {
    const lower = argPrefix.toLowerCase();
    return playerNames.filter((n) => n.toLowerCase().startsWith(lower)).slice(0, 8);
  }, [argPrefix, playerNames]);

  if (filtered.length === 0) return null;

  return (
    <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-slate-600/40 bg-slate-900/95 backdrop-blur-sm p-2 shadow-xl">
      <div className="px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-500 mb-1">
        /{cmdName} &mdash; {t("chat.selectPlayer")}
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

export const ChatPanel = (): ReactNode => {
  const { t } = useTranslation();
  const snapshot = useSyncExternalStore(chatStore.subscribe, chatStore.getSnapshot);
  const authSnapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const hudSnapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const isAdmin = authSnapshot.role === "admin";
  const [inputValue, setInputValue] = useState("");
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputValueRef = useRef(inputValue);
  inputValueRef.current = inputValue;
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(Date.now());

  // Chat history (arrow up/down navigation)
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const draftRef = useRef("");

  // Player names from HUD store
  const playerNames = useMemo(() => hudSnapshot.members.map((m) => m.name), [hudSnapshot.members]);

  // Item link tooltip state
  const [linkTooltip, setLinkTooltip] = useState<{
    itemId: string;
    instanceId?: string;
    rect: DOMRect;
  } | null>(null);
  const handleClickLink = useCallback(
    (itemId: string, instanceId: string | undefined, rect: DOMRect) => {
      setLinkTooltip((prev) =>
        prev?.itemId === itemId && prev?.instanceId === instanceId
          ? null
          : { itemId, instanceId, rect },
      );
    },
    [],
  );
  const closeLinkTooltip = useCallback(() => setLinkTooltip(null), []);

  // Item link display→raw mapping (display name in input → [item:id] for sending)
  const itemLinkMapRef = useRef<Map<string, string>>(new Map());

  // Handle input changes — atomic deletion of item links
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    let newVal = e.target.value;
    let cursor = e.target.selectionStart ?? newVal.length;
    const prev = inputValueRef.current;
    const linkMap = itemLinkMapRef.current;

    // If a link was partially edited, remove the remaining fragment entirely
    for (const displayText of linkMap.keys()) {
      if (!prev.includes(displayText) || newVal.includes(displayText)) continue;
      // Link was broken — find where it was in the old value and where the remnant is
      const oldIdx = prev.indexOf(displayText);
      // The user deleted some chars; the remnant is at roughly the same position
      // Remove all chars of displayText that still exist in newVal at that region
      const charsDeleted = prev.length - newVal.length;
      const remnantLen = displayText.length - charsDeleted;
      if (remnantLen > 0) {
        const remnantIdx = Math.min(oldIdx, newVal.length);
        newVal = newVal.slice(0, remnantIdx) + newVal.slice(remnantIdx + remnantLen);
        cursor = remnantIdx;
      }
      linkMap.delete(displayText);
    }

    setInputValue(newVal);
    // Restore cursor position after atomic deletion
    if (newVal !== e.target.value) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(cursor, cursor);
        }
      }, 0);
    }
  }, []);

  // Autocomplete: selected index for arrow-key navigation
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(0);

  // Determine autocomplete mode
  const acMode = useMemo(
    () => getAutocompleteMode(inputValue, snapshot.commands, isAdmin),
    [inputValue, snapshot.commands, isAdmin],
  );

  // Filtered commands for the overlay (stable between render & key handler)
  const filteredCommands = useMemo(
    () =>
      acMode?.kind === "commands" ? filterCommands(snapshot.commands, acMode.prefix, isAdmin) : [],
    [acMode, snapshot.commands, isAdmin],
  );

  // Reset selection when the filtered list changes
  useEffect(() => {
    setSelectedCmdIndex(0);
  }, [filteredCommands.length, acMode?.kind === "commands" ? acMode.prefix : ""]);

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

  // Register item link insertion callback
  useEffect(() => {
    setInsertItemLinkFn((itemId: string, instanceId?: string) => {
      const def = itemDefStore.getSnapshot().get(itemId);
      const displayName = def ? tFn(def.name, { defaultValue: def.name }) : itemId;
      const displayText = `[${displayName}]`;
      // Store mapping so we can convert back to [item:id] or [item:id:instanceId] on send
      const rawLink = instanceId ? `[item:${itemId}:${instanceId}]` : `[item:${itemId}]`;
      itemLinkMapRef.current.set(displayText, rawLink);

      // Compute new value and cursor position
      const el = inputRef.current;
      const prev = inputValueRef.current;
      const start =
        el && document.activeElement === el ? (el.selectionStart ?? prev.length) : prev.length;
      const newValue = prev.slice(0, start) + displayText + prev.slice(start);
      const newCursor = start + displayText.length;
      setInputValue(newValue);

      // Open chat if not already open
      if (!chatStore.getSnapshot().inputOpen) {
        chatStore.setInputOpen(true);
      }
      // Focus and restore cursor after React re-renders
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.setSelectionRange(newCursor, newCursor);
        }
      }, 0);
    });
    return () => clearInsertItemLinkFn();
  }, []);

  // Global Enter key to open input
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      // Don't intercept if already typing in our input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === settingsStore.getBinding("chat")) {
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
    let text = inputValue.trim();
    if (text) {
      // Convert display names back to [item:id] syntax before sending
      for (const [display, raw] of itemLinkMapRef.current) {
        text = text.replaceAll(display, raw);
      }
      chatSend(text);
      // Push to history (avoid duplicating the last entry)
      const history = historyRef.current;
      if (history.length === 0 || history[history.length - 1] !== text) {
        history.push(text);
        if (history.length > HISTORY_MAX) history.shift();
      }
    }
    itemLinkMapRef.current.clear();
    historyIndexRef.current = -1;
    draftRef.current = "";
    setInputValue("");
    chatStore.setInputOpen(false);
  }, [inputValue]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      e.stopPropagation(); // Prevent game keybinds (C, M, Escape, etc.)

      // When command autocomplete is visible, arrow keys navigate the list
      const cmdAcActive = acMode?.kind === "commands" && filteredCommands.length > 0;

      if (e.key === "Enter") {
        if (cmdAcActive) {
          // Select the highlighted command
          e.preventDefault();
          const cmd = filteredCommands[selectedCmdIndex];
          if (cmd) {
            setInputValue(`/${cmd.name} `);
            setSelectedCmdIndex(0);
          }
          return;
        }
        handleSend();
      } else if (e.key === "Escape") {
        setInputValue("");
        chatStore.setInputOpen(false);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        if (cmdAcActive) {
          setSelectedCmdIndex((prev) => (prev > 0 ? prev - 1 : filteredCommands.length - 1));
          return;
        }
        // Chat history navigation
        const history = historyRef.current;
        if (history.length === 0) return;
        if (historyIndexRef.current === -1) {
          draftRef.current = inputValue;
          historyIndexRef.current = history.length - 1;
        } else if (historyIndexRef.current > 0) {
          historyIndexRef.current--;
        }
        setInputValue(history[historyIndexRef.current]);
      } else if (e.key === "ArrowDown") {
        if (cmdAcActive) {
          e.preventDefault();
          setSelectedCmdIndex((prev) => (prev < filteredCommands.length - 1 ? prev + 1 : 0));
          return;
        }
        if (historyIndexRef.current === -1) return;
        e.preventDefault();
        const history = historyRef.current;
        if (historyIndexRef.current < history.length - 1) {
          historyIndexRef.current++;
          setInputValue(history[historyIndexRef.current]);
        } else {
          historyIndexRef.current = -1;
          setInputValue(draftRef.current);
        }
      } else if (e.key === "Tab") {
        e.preventDefault();

        if (!acMode) return;

        if (acMode.kind === "commands") {
          // Tab selects the highlighted command
          const cmd = filteredCommands[selectedCmdIndex];
          if (cmd) {
            setInputValue(`/${cmd.name} `);
            setSelectedCmdIndex(0);
          }
        } else if (acMode.kind === "players") {
          // Tab autocomplete player name — cycle through matches
          const lower = acMode.argPrefix.toLowerCase();
          const matches = playerNames.filter((n) => n.toLowerCase().startsWith(lower));
          if (matches.length === 0) return;

          const currentArg = inputValue.slice(inputValue.indexOf(" ") + 1).trim();
          const currentIdx = matches.findIndex((n) => n.toLowerCase() === currentArg.toLowerCase());
          const nextIdx = currentIdx === -1 ? 0 : (currentIdx + 1) % matches.length;
          setInputValue(`/${acMode.cmdName} ${matches[nextIdx]}`);
        }
      }
    },
    [
      handleSend,
      inputValue,
      snapshot.commands,
      isAdmin,
      acMode,
      playerNames,
      filteredCommands,
      selectedCmdIndex,
    ],
  );

  return (
    <div
      className="pointer-events-auto absolute bottom-5 left-5 z-[300] w-96 flex flex-col"
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
          return <MessageRow key={msg.id} msg={msg} faded={faded} onClickLink={handleClickLink} />;
        })}
      </div>

      {/* Item link tooltip */}
      {linkTooltip && (
        <ItemLinkTooltip
          itemId={linkTooltip.itemId}
          instanceId={linkTooltip.instanceId}
          anchorRect={linkTooltip.rect}
          onClose={closeLinkTooltip}
        />
      )}

      {/* Input area */}
      {snapshot.inputOpen && (
        <div className="relative">
          {acMode?.kind === "commands" && filteredCommands.length > 0 && (
            <CommandHelpOverlay
              commands={filteredCommands}
              selectedIndex={selectedCmdIndex}
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
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onBlur={() => {
              // Small delay to allow click on help overlay
              setTimeout(() => {
                if (!inputRef.current || document.activeElement !== inputRef.current) {
                  chatStore.setInputOpen(false);
                }
              }, 150);
            }}
            placeholder={t("chat.placeholder")}
            maxLength={200}
            className="w-full rounded-b-lg border border-slate-600/40 bg-slate-900/90 px-3 py-2 text-[13px] text-slate-200 placeholder-slate-500 outline-none backdrop-blur-sm focus:border-sky-500/50"
          />
        </div>
      )}

      {/* Hint when chat is not open */}
      {!snapshot.inputOpen && snapshot.messages.length === 0 && (
        <div className="px-2 py-1 text-[11px] text-slate-600">
          <Trans
            i18nKey="chat.hintOpen"
            components={{
              kbd: (
                <kbd className="rounded bg-slate-800/60 px-1 py-0.5 text-[10px] font-mono text-slate-500" />
              ),
            }}
          />
        </div>
      )}
    </div>
  );
};
