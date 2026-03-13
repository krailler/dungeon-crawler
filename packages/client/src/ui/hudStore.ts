import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { HudRoot } from "./HudRoot";

export type PartyMember = {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  isLocal: boolean;
};

export type HudSnapshot = {
  members: PartyMember[];
  fps: number;
  ping: number;
};

type Listener = () => void;

type MemberMap = Map<string, PartyMember>;

const listeners = new Set<Listener>();
const members: MemberMap = new Map();
const order: string[] = [];

let fps = 0;
let ping = 0;
let fpsAccum = 0;
let fpsFrames = 0;

let cachedSnapshot: HudSnapshot = {
  members: [],
  fps: 0,
  ping: 0,
};

const rebuildSnapshot = (): void => {
  cachedSnapshot = {
    members: sortedMembers(),
    fps,
    ping,
  };
};

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

const sortedMembers = (): PartyMember[] => {
  const list = order
    .map((id) => members.get(id))
    .filter((member): member is PartyMember => Boolean(member));

  const local = list.filter((member) => member.isLocal);
  const others = list.filter((member) => !member.isLocal);
  return [...local, ...others];
};

export const hudStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): HudSnapshot {
    return cachedSnapshot;
  },
  setMember(update: PartyMember): void {
    const existing = members.get(update.id);
    if (!existing) {
      order.push(update.id);
    }
    members.set(update.id, update);
    rebuildSnapshot();
    emit();
  },
  updateMember(id: string, update: Partial<PartyMember>): void {
    const existing = members.get(id);
    if (!existing) return;
    members.set(id, { ...existing, ...update });
    rebuildSnapshot();
    emit();
  },
  removeMember(id: string): void {
    if (!members.has(id)) return;
    members.delete(id);
    const index = order.indexOf(id);
    if (index >= 0) {
      order.splice(index, 1);
    }
    rebuildSnapshot();
    emit();
  },
  updateFPS(dt: number): void {
    fpsAccum += dt;
    fpsFrames++;
    if (fpsAccum >= 0.5) {
      const value = Math.round(fpsFrames / fpsAccum);
      fpsAccum = 0;
      fpsFrames = 0;
      if (fps === value) return;
      fps = value;
      rebuildSnapshot();
      emit();
    }
  },
  setPing(value: number): void {
    if (ping === value) return;
    ping = value;
    rebuildSnapshot();
    emit();
  },
  reset(): void {
    members.clear();
    order.length = 0;
    fps = 0;
    ping = 0;
    fpsAccum = 0;
    fpsFrames = 0;
    rebuildSnapshot();
    emit();
  },
};

/* ------------------------------------------------------------------ */
/*  React lifecycle — mount / dispose                                  */
/* ------------------------------------------------------------------ */

let root: Root | null = null;

export function mountHud(): void {
  const el = document.getElementById("ui-root");
  if (!el) throw new Error("UI root #ui-root not found");
  root = createRoot(el);
  root.render(createElement(HudRoot));
}

export function disposeHud(): void {
  root?.unmount();
  root = null;
  hudStore.reset();
}
