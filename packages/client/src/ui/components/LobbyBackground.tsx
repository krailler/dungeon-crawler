import type { ReactNode } from "react";

/**
 * Animated dark-fantasy background for the lobby screen.
 * Layered slow-moving gradient blobs + subtle grid + vignette.
 * Pure CSS — no canvas, no 3D.
 */
export const LobbyBackground = (): ReactNode => (
  <div className="pointer-events-none absolute inset-0 overflow-hidden">
    {/* Base dark gradient */}
    <div className="absolute inset-0 bg-gradient-to-b from-[#05070d] via-[#0a0e1a] to-[#05070d]" />

    {/* Slow-drifting fog layers */}
    <div className="lobby-fog lobby-fog-1" />
    <div className="lobby-fog lobby-fog-2" />
    <div className="lobby-fog lobby-fog-3" />

    {/* Subtle grid overlay */}
    <div className="lobby-grid" />

    {/* Vignette */}
    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(5,7,13,0.85)_100%)]" />
  </div>
);
