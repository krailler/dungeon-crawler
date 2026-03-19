import { useSyncExternalStore } from "react";
import { hudStore } from "../stores/hudStore";

/**
 * Full-screen red vignette overlay that appears when the local player
 * is below 30% HP. Intensity increases as health drops lower.
 * Pure CSS — no post-process cost.
 */
export function LowHealthVignette() {
  const snapshot = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const local = snapshot.members.find((m) => m.isLocal);

  if (!local || local.maxHealth <= 0) return null;

  const ratio = local.health / local.maxHealth;
  const threshold = 0.3;

  if (ratio >= threshold || ratio <= 0) return null;

  // 0 at 30% → 1 at 0% HP
  const intensity = 1 - ratio / threshold;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[150]"
      style={{
        boxShadow: `inset 0 0 ${60 + intensity * 80}px ${10 + intensity * 30}px rgba(180, 0, 0, ${0.15 + intensity * 0.45})`,
        transition: "box-shadow 0.3s ease",
      }}
    />
  );
}
