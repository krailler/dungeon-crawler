import { useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { hudStore } from "../stores/hudStore";
import { effectDefStore } from "../stores/effectDefStore";
import { EffectIcon } from "../components/EffectIcon";

export const BuffBar = (): ReactNode => {
  const snap = useSyncExternalStore(hudStore.subscribe, hudStore.getSnapshot);
  const defSnap = useSyncExternalStore(effectDefStore.subscribe, effectDefStore.getSnapshot);

  const localMember = useMemo(() => snap.members.find((m) => m.isLocal), [snap.members]);
  const effects = localMember?.effects;

  if (!effects || effects.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {effects.map((effect) => (
        <EffectIcon
          key={effect.effectId}
          effectId={effect.effectId}
          remaining={effect.remaining}
          duration={effect.duration}
          stacks={effect.stacks}
          def={defSnap.get(effect.effectId)}
          modValue={effect.modValue}
        />
      ))}
    </div>
  );
};
