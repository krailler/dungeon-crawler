import type { ReactNode } from "react";
import { playUiSfx } from "../../audio/uiSfx";

type HudPanelProps = {
  /** Header content (left side) — typically a title or title + subtitle */
  header: ReactNode;
  /** Panel body */
  children: ReactNode;
  /** Close handler */
  onClose: () => void;
  /** Extra classes for the outer positioning wrapper (absolute position, width, etc.) */
  className?: string;
};

export const HudPanel = ({
  header,
  children,
  onClose,
  className = "",
}: HudPanelProps): JSX.Element => (
  <div className={`pointer-events-auto animate-rise-in ${className}`}>
    <div className="rounded-2xl border border-[color:var(--ui-panel-border)] bg-[color:var(--ui-panel)] p-4 shadow-xl shadow-black/40 backdrop-blur-md">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
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
