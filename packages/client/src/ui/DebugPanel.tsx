import { useState, useSyncExternalStore } from "react";
import { debugStore } from "./debugStore";
import type { DebugSnapshot } from "./debugStore";

type ToggleEntry = {
  key: keyof DebugSnapshot;
  label: string;
};

const TOGGLES: ToggleEntry[] = [
  { key: "fog", label: "Fog of War" },
  { key: "wallOcclusion", label: "Wall Occlusion" },
  { key: "freeCamera", label: "Free Camera" },
  { key: "wireframe", label: "Wireframe" },
];

export const DebugPanel = (): JSX.Element => {
  const [open, setOpen] = useState(false);
  const snapshot = useSyncExternalStore(debugStore.subscribe, debugStore.getSnapshot);

  return (
    <div className="pointer-events-auto absolute left-4 top-4 select-none">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-slate-900/90 px-3 py-1.5 text-xs font-semibold text-amber-400 backdrop-blur transition-colors hover:border-amber-400/50 hover:bg-slate-800/90"
      >
        <span>⚙</span>
        <span>Debug</span>
        <span className="text-[10px] text-amber-400/60">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-600/40 bg-slate-900/95 px-3 py-2.5 backdrop-blur">
          <div className="flex flex-col gap-2">
            {TOGGLES.map(({ key, label }) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 transition-colors hover:text-slate-100"
              >
                <input
                  type="checkbox"
                  checked={snapshot[key]}
                  onChange={() => debugStore.toggle(key)}
                  className="h-3.5 w-3.5 cursor-pointer rounded border-slate-500 bg-slate-800 accent-amber-500"
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
