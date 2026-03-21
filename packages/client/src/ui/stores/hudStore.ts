import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type {
  PromoteLeaderMessage,
  PartyKickMessage,
  SkillToggleMessage,
  SkillUseMessage,
  AllocatableStatValue,
  StatAllocateMessage,
  ItemUseMessage,
  ItemSwapMessage,
  ItemDestroyMessage,
  ItemSplitMessage,
  ConsumableBarAssignMessage,
  ConsumableBarUnassignMessage,
  ConsumableBarSwapMessage,
  EquipItemMessage,
  UnequipItemMessage,
} from "@dungeon/shared";
import type { EquipmentSlotValue } from "@dungeon/shared";
import { HudRoot } from "../hud/HudRoot";

/** Chrome-only performance.memory API */
interface PerformanceWithMemory extends Performance {
  memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number };
}

export type CharacterStats = {
  strength: number;
  vitality: number;
  agility: number;
  attackDamage: number;
  defense: number;
  speed: number;
  attackCooldown: number;
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
  classId?: string;
  lifeState?: string;
  bleedTimer?: number;
  respawnTimer?: number;
  reviveProgress?: number;
  // Private fields — only available for the local player (via @view)
  gold?: number;
  xp?: number;
  xpToNext?: number;
  statPoints?: number;
  talentPoints?: number;
  stamina?: number;
  skills?: string[];
  autoAttackEnabled?: boolean;
  stats?: CharacterStats;
  inventory?: { slot: number; itemId: string; quantity: number; instanceId?: string }[];
  consumableBar?: string[];
  equipment?: Record<string, { instanceId: string }>;
  effects?: {
    effectId: string;
    remaining: number;
    duration: number;
    stacks: number;
    modValue: number;
  }[];
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
  /** Active item cooldowns, keyed by item ID */
  itemCooldowns: Map<string, SkillCooldownState>;
  roomName: string;
  dungeonLevel: number;
  /** Average frame time in milliseconds (proxy for CPU load) */
  frameMs: number;
  /** JS heap usage in MB (Chrome only, 0 if unavailable) */
  heapMB: number;
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
let frameMs = 0;
let heapMB = 0;
let connectionStatus: ConnectionStatus = "connecting";
let connectionInfo: string = "";
let localCoords: { x: number; z: number } | null = null;
const skillCooldowns: Map<string, SkillCooldownState> = new Map();
const itemCooldowns: Map<string, SkillCooldownState> = new Map();
let roomName = "";
let dungeonLevel = 1;

let cachedSnapshot: HudSnapshot = {
  members: [],
  fps: 0,
  ping: 0,
  connectionStatus: "connecting",
  connectionInfo: "",
  localCoords: null,
  skillCooldowns: new Map(),
  itemCooldowns: new Map(),
  roomName: "",
  dungeonLevel: 1,
  frameMs: 0,
  heapMB: 0,
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
    itemCooldowns: new Map(itemCooldowns),
    roomName,
    dungeonLevel,
    frameMs,
    heapMB,
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
      const newFps = Math.round(fpsFrames / fpsAccum);
      const newFrameMs = fpsFrames > 0 ? Math.round((fpsAccum / fpsFrames) * 1000 * 10) / 10 : 0;

      // Read JS heap (Chrome only — performance.memory is non-standard)
      const perf = performance as PerformanceWithMemory;
      const newHeapMB = perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1048576) : 0;

      fpsAccum = 0;
      fpsFrames = 0;

      if (fps === newFps && frameMs === newFrameMs && heapMB === newHeapMB) return;
      fps = newFps;
      frameMs = newFrameMs;
      heapMB = newHeapMB;
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
    frameMs = 0;
    heapMB = 0;
    connectionStatus = "connecting";
    connectionInfo = "";
    localCoords = null;
    roomName = "";
    dungeonLevel = 1;
    room = null;
    skillCooldowns.clear();
    itemCooldowns.clear();
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
  /** Helper: safely read local player's gold (may be undefined for non-local) */
  getLocalGold(): number {
    const local = cachedSnapshot.members.find((m) => m.isLocal);
    return local?.gold ?? 0;
  },
  toggleSkill(skillId: string): void {
    if (!room) return;
    const msg: SkillToggleMessage = { skillId };
    room.send(MessageType.SKILL_TOGGLE, msg);
  },
  useSkill(skillId: string): void {
    if (!room) return;
    const msg: SkillUseMessage = { skillId };
    room.send(MessageType.SKILL_USE, msg);
  },
  allocateStat(stat: AllocatableStatValue): void {
    if (!room) return;
    const msg: StatAllocateMessage = { stat };
    room.send(MessageType.STAT_ALLOCATE, msg);
  },
  resetStats(): void {
    if (!room) return;
    room.send(MessageType.STAT_RESET, {});
  },
  setRoomName(name: string): void {
    if (roomName === name) return;
    roomName = name;
    rebuildSnapshot();
    emit();
  },
  setDungeonLevel(level: number): void {
    if (dungeonLevel === level) return;
    dungeonLevel = level;
    rebuildSnapshot();
    emit();
  },
  setSkillCooldown(skillId: string, duration: number): void {
    if (duration <= 0) {
      skillCooldowns.delete(skillId);
    } else {
      skillCooldowns.set(skillId, { duration, startedAt: Date.now() });
    }
    rebuildSnapshot();
    emit();
  },
  useItem(itemId: string): void {
    if (!room) return;
    const msg: ItemUseMessage = { itemId };
    room.send(MessageType.ITEM_USE, msg);
  },
  swapInventorySlots(from: number, to: number): void {
    if (!room) return;
    const msg: ItemSwapMessage = { from, to };
    room.send(MessageType.ITEM_SWAP, msg);
  },
  destroyInventorySlot(slot: number): void {
    if (!room) return;
    const msg: ItemDestroyMessage = { slot };
    room.send(MessageType.ITEM_DESTROY, msg);
  },
  splitInventorySlot(from: number, to: number, quantity: number): void {
    if (!room) return;
    const msg: ItemSplitMessage = { from, to, quantity };
    room.send(MessageType.ITEM_SPLIT, msg);
  },
  setItemCooldown(itemId: string, duration: number): void {
    itemCooldowns.set(itemId, { duration, startedAt: Date.now() });
    rebuildSnapshot();
    emit();
  },
  assignConsumableBar(slot: number, itemId: string): void {
    if (!room) return;
    const msg: ConsumableBarAssignMessage = { slot, itemId };
    room.send(MessageType.CONSUMABLE_BAR_ASSIGN, msg);
  },
  unassignConsumableBar(slot: number): void {
    if (!room) return;
    const msg: ConsumableBarUnassignMessage = { slot };
    room.send(MessageType.CONSUMABLE_BAR_UNASSIGN, msg);
  },
  swapConsumableBarSlots(from: number, to: number): void {
    if (!room) return;
    const msg: ConsumableBarSwapMessage = { from, to };
    room.send(MessageType.CONSUMABLE_BAR_SWAP, msg);
  },
  equipItem(invSlot: number, equipSlot: EquipmentSlotValue): void {
    if (!room) return;
    const msg: EquipItemMessage = { invSlot, equipSlot };
    room.send(MessageType.EQUIP_ITEM, msg);
  },
  unequipItem(equipSlot: EquipmentSlotValue): void {
    if (!room) return;
    const msg: UnequipItemMessage = { equipSlot };
    room.send(MessageType.UNEQUIP_ITEM, msg);
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
