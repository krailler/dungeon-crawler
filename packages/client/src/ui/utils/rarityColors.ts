/** Single source of truth for item rarity colors across all UI. */

export interface RarityStyle {
  text: string;
  border: string;
  shadow: string;
}

const RARITY_STYLES: Record<string, RarityStyle> = {
  common: {
    text: "text-slate-200",
    border: "",
    shadow: "",
  },
  uncommon: {
    text: "text-emerald-400",
    border: "!border-emerald-400/80",
    shadow: "!shadow-[0_0_6px_rgba(52,211,153,0.3)]",
  },
  rare: {
    text: "text-blue-400",
    border: "!border-blue-400/80",
    shadow: "!shadow-[0_0_6px_rgba(96,165,250,0.3)]",
  },
  epic: {
    text: "text-purple-400",
    border: "!border-purple-400/80",
    shadow: "!shadow-[0_0_6px_rgba(192,132,252,0.3)]",
  },
  legendary: {
    text: "text-amber-400",
    border: "!border-amber-400/80",
    shadow: "!shadow-[0_0_6px_rgba(251,191,36,0.3)]",
  },
};

const DEFAULT_STYLE = RARITY_STYLES.common;

export function getRarityStyle(rarity?: string): RarityStyle {
  return RARITY_STYLES[rarity ?? "common"] ?? DEFAULT_STYLE;
}
