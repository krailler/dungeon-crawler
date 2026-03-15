import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type {
  PromoteLeaderMessage,
  PartyKickMessage,
  SkillToggleMessage,
  SkillUseMessage,
  SkillIdValue,
} from "@dungeon/shared";
import { HudRoot } from "../hud/HudRoot";

export type CharacterStats = {
  strength: number;
  vitality: number;
  agility: number;
  attackDamage: number;
  defense: number;
};

export type PartyMember = {
  id: string;
  name: string;
  health: number;
  maxHealth: number;
  isLocal: boolean;
  online: boolean;
  isLeader: boolean;
  level: number;
  gold: number;
  xp: number;
  xpToNext: number;
  skills: string[];
  autoAttackEnabled: boolean;
  stats?: CharacterStats;
};

export type ConnectionStatus = "connecting" | "connected" | "error";

export type SkillCooldownState = {
  /** Total cooldown duration in seconds */
  duration: number;
  /** Timestamp (ms) when the cooldown started */
  startedAt: number;
};

export type HudSnapshot = {
  members: PartyMember[];
  fps: number;
  ping: number;
  connectionStatus: ConnectionStatus;
  connectionInfo: string;
  localCoords: { x: number; z: number } | null;
  /** Active skill cooldowns, keyed by skill ID */
  skillCooldowns: Map<string, SkillCooldownState>;
};

type Listener = () => void;

type MemberMap = Map<string, PartyMember>;

const listeners = new Set<Listener>();
const members: MemberMap = new Map();
const order: string[] = [];
let room: Room | null = null;

let fps = 0;
let ping = 0;
let fpsAccum = 0;
let fpsFrames = 0;
let connectionStatus: ConnectionStatus = "connecting";
let connectionInfo: string = "";
let localCoords: { x: number; z: number } | null = null;
const skillCooldowns: Map<string, SkillCooldownState> = new Map();

let cachedSnapshot: HudSnapshot = {
  members: [],
  fps: 0,
  ping: 0,
  connectionStatus: "connecting",
  connectionInfo: "",
  localCoords: null,
  skillCooldowns: new Map(),
};

const rebuildSnapshot = (): void => {
  cachedSnapshot = {
    members: sortedMembers(),
    fps,
    ping,
    connectionStatus,
    connectionInfo,
    localCoords,
    skillCooldowns: new Map(skillCooldowns),
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

  const leaders = list.filter((member) => member.isLeader);
  const others = list.filter((member) => !member.isLeader);
  return [...leaders, ...others];
};

export const hudStore = {
  setRoom(r: Room): void {
    room = r;
  },
  clearRoom(): void {
    room = null;
  },
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
  setConnection(status: ConnectionStatus, info: string): void {
    connectionStatus = status;
    connectionInfo = info;
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
    connectionStatus = "connecting";
    connectionInfo = "";
    localCoords = null;
    room = null;
    skillCooldowns.clear();
    rebuildSnapshot();
    emit();
  },
  setLocalCoords(x: number, z: number): void {
    const rx = Math.round(x * 100) / 100;
    const rz = Math.round(z * 100) / 100;
    if (localCoords && localCoords.x === rx && localCoords.z === rz) return;
    localCoords = { x: rx, z: rz };
    rebuildSnapshot();
    emit();
  },
  promoteLeader(targetSessionId: string): void {
    if (!room) return;
    const msg: PromoteLeaderMessage = { targetSessionId };
    room.send(MessageType.PROMOTE_LEADER, msg);
  },
  kickPlayer(targetSessionId: string): void {
    if (!room) return;
    const msg: PartyKickMessage = { targetSessionId };
    room.send(MessageType.PARTY_KICK, msg);
  },
  toggleSkill(skillId: SkillIdValue): void {
    if (!room) return;
    const msg: SkillToggleMessage = { skillId };
    room.send(MessageType.SKILL_TOGGLE, msg);
  },
  useSkill(skillId: SkillIdValue): void {
    if (!room) return;
    const msg: SkillUseMessage = { skillId };
    room.send(MessageType.SKILL_USE, msg);
  },
  setSkillCooldown(skillId: string, duration: number): void {
    skillCooldowns.set(skillId, { duration, startedAt: Date.now() });
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
