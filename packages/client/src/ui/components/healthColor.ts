/** Health bar gradient classes based on health percentage (0-100). */
export const healthColor = (pct: number): string => {
  if (pct > 60) return "from-emerald-400/90 via-emerald-400/60 to-emerald-500/80";
  if (pct > 30) return "from-amber-400/90 via-amber-400/70 to-amber-500/80";
  return "from-red-400/90 via-red-400/70 to-red-500/80";
};
