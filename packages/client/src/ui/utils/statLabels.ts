/** Stat name → i18n key mapping for equipment/talent tooltips */
export const STAT_I18N: Record<string, string> = {
  strength: "character.strength",
  vitality: "character.vitality",
  agility: "character.agility",
  maxHealth: "equipment.statMaxHealth",
  attackDamage: "equipment.statAttackDamage",
  defense: "equipment.statDefense",
  moveSpeed: "equipment.statMoveSpeed",
  attackCooldown: "equipment.statAttackCooldown",
};

/** Format a stat value for display (integer vs float precision) */
export function formatStatValue(stat: string, value: number): string {
  if (stat === "attackCooldown") return `${value > 0 ? "+" : ""}${value.toFixed(2)}s`;
  if (stat === "moveSpeed") return `+${value.toFixed(2)}`;
  return `+${Math.round(value)}`;
}

/** Format a stat range for display */
export function formatStatRange(stat: string, min: number, max: number): string {
  if (stat === "attackCooldown") {
    return `+${min.toFixed(2)}–${max.toFixed(2)}s`;
  }
  if (stat === "moveSpeed") {
    return `+${min.toFixed(2)}–${max.toFixed(2)}`;
  }
  return `+${Math.round(min)}–${Math.round(max)}`;
}

/** Format a stat diff for comparison display */
export function formatStatDiff(stat: string, diff: number): string {
  const sign = diff > 0 ? "+" : "";
  if (stat === "attackCooldown") return `${sign}${diff.toFixed(2)}s`;
  if (stat === "moveSpeed") return `${sign}${diff.toFixed(2)}`;
  return `${sign}${Math.round(diff)}`;
}
