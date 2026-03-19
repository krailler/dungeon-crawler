import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LoadingScreen } from "../screens/LoadingScreen";

export const LoadingPhase = {
  MODELS: "models",
  SERVER: "server",
  DUNGEON_ASSETS: "dungeon_assets",
  DUNGEON_RENDER: "dungeon_render",
  COMPLETE: "complete",
  ERROR: "error",
} as const;

export type LoadingPhaseValue = (typeof LoadingPhase)[keyof typeof LoadingPhase];

export type LoadingSnapshot = {
  phase: LoadingPhaseValue;
  progress: number;
  visible: boolean;
  fadingOut: boolean;
};

type Listener = () => void;

const PHASE_PROGRESS: Record<string, number> = {
  [LoadingPhase.MODELS]: 0,
  [LoadingPhase.SERVER]: 30,
  [LoadingPhase.DUNGEON_ASSETS]: 55,
  [LoadingPhase.DUNGEON_RENDER]: 80,
  [LoadingPhase.COMPLETE]: 100,
};

const FADE_DURATION = 800;

const listeners = new Set<Listener>();

let phase: LoadingPhaseValue = LoadingPhase.MODELS;
let progress = 0;
let visible = true;
let fadingOut = false;
let fadeTimer: number = 0;

let cachedSnapshot: LoadingSnapshot = {
  phase: LoadingPhase.MODELS,
  progress: 0,
  visible: true,
  fadingOut: false,
};

const rebuildSnapshot = (): void => {
  cachedSnapshot = { phase, progress, visible, fadingOut };
};

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const loadingStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): LoadingSnapshot {
    return cachedSnapshot;
  },

  setPhase(newPhase: LoadingPhaseValue): void {
    phase = newPhase;
    // Error phase keeps current progress
    if (newPhase !== LoadingPhase.ERROR) {
      progress = PHASE_PROGRESS[newPhase] ?? progress;
    }
    rebuildSnapshot();
    emit();
  },

  /** Set progress directly (0-100) for granular updates within a phase */
  setProgress(value: number): void {
    progress = Math.min(100, Math.max(0, value));
    rebuildSnapshot();
    emit();
  },

  startFadeOut(): void {
    fadingOut = true;
    rebuildSnapshot();
    emit();

    fadeTimer = window.setTimeout(() => {
      visible = false;
      rebuildSnapshot();
      emit();
    }, FADE_DURATION);
  },

  reset(): void {
    window.clearTimeout(fadeTimer);
    phase = LoadingPhase.MODELS;
    progress = 0;
    visible = true;
    fadingOut = false;
    rebuildSnapshot();
    emit();
  },
};

/* ------------------------------------------------------------------ */
/*  React lifecycle — mount / dispose                                  */
/* ------------------------------------------------------------------ */

let root: Root | null = null;

export function mountLoading(): void {
  const el = document.getElementById("loading-root");
  if (!el) throw new Error("Loading root #loading-root not found");
  root = createRoot(el);
  root.render(createElement(LoadingScreen));
}

export function disposeLoading(): void {
  root?.unmount();
  root = null;
  loadingStore.reset();
}
