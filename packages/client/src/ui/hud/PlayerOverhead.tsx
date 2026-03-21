import type { ReactNode } from "react";
import { ActionFeedback } from "./ActionFeedback";
import { HealthBarOverhead } from "./HealthBarOverhead";
import { BuffBar } from "./BuffBar";

/**
 * Container for all UI elements displayed above the local player's character.
 * Stacks vertically: action feedback, health bar, buff/debuff icons.
 */
export const PlayerOverhead = (): ReactNode => {
  return (
    <div className="pointer-events-none absolute top-[55%] left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
      {/* Feedback floats above without pushing layout */}
      <div className="absolute bottom-full mb-1 flex flex-col items-center gap-1">
        <ActionFeedback />
      </div>
      <HealthBarOverhead />
      <BuffBar />
    </div>
  );
};
