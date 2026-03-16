import type { ReactNode } from "react";
import { playUiSfx } from "../../audio/uiSfx";
import { useDraggable } from "../hooks/useDraggable";

type HudPanelProps = {
  /** Header content (left side) — typically a title or title + subtitle */
  header: ReactNode;
  /** Panel body */
  children: ReactNode;
  /** Close handler */
  onClose: () => void;
  /** Extra classes for the outer positioning wrapper (width, etc.) */
  className?: string;
  /** Unique panel ID for drag persistence — enables dragging when set */
  panelId?: string;
  /** Default position when no saved position exists */
  defaultPosition?: { x: number; y: number };
};

export const HudPanel = ({
  header,
  children,
  onClose,
  className = "",
  panelId,
  defaultPosition,
}: HudPanelProps): JSX.Element => {
  const drag = useDraggable(panelId, defaultPosition ?? { x: 0, y: 0 });

  return (
    <div
      ref={drag.panelRef}
      className={`pointer-events-auto animate-rise-in ${className}`}
      style={
        drag.enabled
          ? { position: "absolute", left: drag.position.x, top: drag.position.y }
          : undefined
      }
    >
      <div className="rounded-2xl border border-[color:var(--ui-panel-border)] bg-[color:var(--ui-panel)] p-4 shadow-xl shadow-black/40 backdrop-blur-md">
        {/* Header — drag handle when panelId is set */}
        <div
          ref={drag.handleRef}
          className={`mb-3 flex items-center justify-between ${drag.enabled ? (drag.isDragging ? "cursor-grabbing" : "cursor-grab") : ""}`}
          style={drag.enabled ? { userSelect: "none" } : undefined}
        >
          {header}
          <button
            onClick={() => {
              playUiSfx("ui_click");
              onClose();
            }}
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-slate-700/50 hover:text-slate-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};
