import { useCallback, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { debugStore } from "../stores/debugStore";
import type { DebugSnapshot } from "../stores/debugStore";
import { adminStore } from "../stores/adminStore";
import { authStore } from "../stores/authStore";
import { minimapStore } from "../stores/minimapStore";
import { HudButton } from "../components/HudButton";
import { playUiSfx } from "../../audio/uiSfx";

type ToggleEntry = {
  key: keyof DebugSnapshot;
  label: string;
  adminOnly?: boolean;
};

const TOGGLES: ToggleEntry[] = [
  { key: "fog", label: "Fog of War" },
  { key: "wallOcclusion", label: "Wall Occlusion" },
  { key: "freeCamera", label: "Free Camera" },
  { key: "wireframe", label: "Wireframe" },
  { key: "ambient", label: "Ambient Sound" },
  { key: "combatLog", label: "Combat Log", adminOnly: true },
  { key: "showPaths", label: "Show Paths", adminOnly: true },
  { key: "showCoords", label: "Show Coords" },
  { key: "showTickRate", label: "Show Tick Rate", adminOnly: true },
  { key: "showAllCreatures", label: "Show All Creatures (AOI bypass)", adminOnly: true },
];

export const DebugPanel = (): ReactNode => {
  const [open, setOpen] = useState(false);
  const [seedInput, setSeedInput] = useState("");
  const admin = useSyncExternalStore(adminStore.subscribe, adminStore.getSnapshot);
  const snapshot = useSyncExternalStore(debugStore.subscribe, debugStore.getSnapshot);
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const isAdmin = auth.role === "admin";
  const toggleOpen = useCallback(() => setOpen((v) => !v), []);

  return (
    <div className="pointer-events-auto absolute left-4 top-4 z-50 select-none">
      <HudButton
        onClick={toggleOpen}
        isOpen={open}
        variant="amber"
        icon={<span>⚙</span>}
        label="Debug"
        shortcut="D"
        suffix={<span className="text-[10px] text-amber-400/60">{open ? "▲" : "▼"}</span>}
      />

      {open && (
        <div className="mt-1.5 rounded-lg border border-slate-600/40 bg-slate-900/95 px-3 py-2.5 backdrop-blur">
          <div className="flex flex-col gap-2">
            {TOGGLES.filter((t) => !t.adminOnly || isAdmin).map(({ key, label }) => (
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
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300 transition-colors hover:text-slate-100">
              <input
                type="checkbox"
                onChange={() => minimapStore.revealAll()}
                className="h-3.5 w-3.5 cursor-pointer rounded border-slate-500 bg-slate-800 accent-amber-500"
              />
              Full minimap
            </label>
          </div>

          <button
            onClick={() => {
              playUiSfx("ui_click");
              debugStore.resetAll();
            }}
            className="mt-3 w-full rounded border border-slate-600/40 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-slate-400 transition-colors hover:border-slate-500/60 hover:bg-slate-700/80 hover:text-slate-200"
          >
            Reset options
          </button>

          {/* Server admin section — only visible to admins */}
          {isAdmin && (
            <div className="mt-3 border-t border-slate-600/40 pt-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-amber-400/70">
                Server
              </span>
              <div className="mt-1.5 flex flex-col gap-0.5 text-[10px] text-slate-500">
                {admin.roomId && (
                  <div>
                    Room: <span className="font-mono text-slate-400">{admin.roomId}</span>
                  </div>
                )}
                {admin.sessionId && (
                  <div>
                    Session: <span className="font-mono text-slate-400">{admin.sessionId}</span>
                  </div>
                )}
                {admin.runtime && (
                  <div>
                    Runtime: <span className="font-mono text-slate-400">{admin.runtime}</span>
                  </div>
                )}
                <div>
                  Seed: <span className="font-mono text-slate-400">{admin.seed}</span>
                </div>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                <button
                  onClick={() => {
                    playUiSfx("ui_click");
                    adminStore.restartRoom();
                  }}
                  className="w-full rounded border border-red-500/30 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-red-400 transition-colors hover:border-red-400/50 hover:bg-red-950/40 hover:text-red-300"
                >
                  Restart room
                </button>
                <div className="flex gap-1">
                  <input
                    type="number"
                    value={seedInput}
                    onChange={(e) => setSeedInput(e.target.value)}
                    placeholder="Seed"
                    className="w-full min-w-0 rounded border border-slate-600/40 bg-slate-800/80 px-2 py-1 text-[10px] text-slate-300 placeholder-slate-500 outline-none focus:border-amber-500/50"
                  />
                  <button
                    onClick={() => {
                      playUiSfx("ui_click");
                      const seed = seedInput ? parseInt(seedInput, 10) : null;
                      adminStore.restartRoom(Number.isNaN(seed) ? null : seed);
                    }}
                    className="shrink-0 rounded border border-slate-600/40 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-slate-400 transition-colors hover:border-slate-500/60 hover:bg-slate-700/80 hover:text-slate-200"
                  >
                    Go
                  </button>
                </div>
                <button
                  onClick={() => {
                    playUiSfx("ui_click");
                    adminStore.randomRestart();
                  }}
                  className="w-full rounded border border-slate-600/40 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-slate-400 transition-colors hover:border-slate-500/60 hover:bg-slate-700/80 hover:text-slate-200"
                >
                  Random seed
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
