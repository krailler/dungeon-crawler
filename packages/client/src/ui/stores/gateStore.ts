import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type { GateInteractMessage } from "@dungeon/shared";

type GateInfo = {
  id: string;
  gateType: string;
  tileX: number;
  tileY: number;
  isOpen: boolean;
};

type GateSnapshot = {
  /** All tracked gates keyed by id */
  gates: Map<string, GateInfo>;
  /** True when every gate in the map is open */
  allOpen: boolean;
  /** The id of the nearest interactable gate (within range, closed), or null */
  nearestInteractableId: string | null;
  /** Show "Press F" hint when leader is near a closed gate */
  showInteractHint: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();
let room: Room | null = null;

let gates: Map<string, GateInfo> = new Map();
let nearestInteractableId: string | null = null;
let showInteractHint = false;
/** Gate ids with a pending countdown — suppress hint while active */
let pendingGates: Set<string> = new Set();

let snapshot: GateSnapshot = buildSnapshot();

function buildSnapshot(): GateSnapshot {
  const allOpen = gates.size > 0 && [...gates.values()].every((g) => g.isOpen);
  return {
    gates,
    allOpen,
    nearestInteractableId,
    showInteractHint,
  };
}

const emit = (): void => {
  snapshot = buildSnapshot();
  for (const listener of listeners) {
    listener();
  }
};

export const gateStore = {
  setRoom(r: Room): void {
    room = r;
  },

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): GateSnapshot {
    return snapshot;
  },

  /** Add or update a gate from server state */
  addGate(id: string, gateType: string, tileX: number, tileY: number, isOpen: boolean): void {
    gates.set(id, { id, gateType, tileX, tileY, isOpen });
    emit();
  },

  /** Remove a gate (e.g. on dungeon rebuild) */
  removeGate(id: string): void {
    gates.delete(id);
    if (nearestInteractableId === id) {
      nearestInteractableId = null;
      showInteractHint = false;
    }
    emit();
  },

  /** Mark a gate as open */
  setGateOpen(id: string, value: boolean): void {
    const gate = gates.get(id);
    if (!gate || gate.isOpen === value) return;
    gate.isOpen = value;
    if (value) {
      pendingGates.delete(id);
      if (nearestInteractableId === id) {
        nearestInteractableId = null;
        showInteractHint = false;
      }
    }
    emit();
  },

  /** Called each frame from proximity check — sets which gate is interactable */
  setNearestInteractable(id: string | null): void {
    // Suppress hint if this gate already has a pending countdown
    const hint = id !== null && !pendingGates.has(id);
    if (nearestInteractableId === id && showInteractHint === hint) return;
    nearestInteractableId = id;
    showInteractHint = hint;
    emit();
  },

  /** Send gate interaction to server for the nearest interactable gate */
  confirmOpenNearest(): void {
    if (!room || !nearestInteractableId) return;
    this.confirmOpenGate(nearestInteractableId);
  },

  /** Send gate interaction to server for a specific gate id */
  confirmOpenGate(gateId: string): void {
    if (!room) return;
    const gate = gates.get(gateId);
    if (!gate || gate.isOpen) return;
    const msg: GateInteractMessage = { gateId };
    room.send(MessageType.GATE_INTERACT, msg);
    // Suppress hint while countdown is active
    pendingGates.add(gateId);
    if (nearestInteractableId === gateId) {
      showInteractHint = false;
    }
    emit();
  },

  reset(): void {
    room = null;
    gates = new Map();
    nearestInteractableId = null;
    showInteractHint = false;
    pendingGates = new Set();
    emit();
  },
};
