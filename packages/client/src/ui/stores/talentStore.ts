import type { Room } from "@colyseus/sdk";
import type { TalentStateMessage, TalentAllocatedMessage } from "@dungeon/shared";
import { MessageType } from "@dungeon/shared";
import { talentDefStore } from "./talentDefStore";

type TalentStoreSnapshot = {
  allocations: Map<string, number>;
  /** All talent IDs for the player's class */
  classTalentIds: string[];
};

let state: TalentStoreSnapshot = {
  allocations: new Map(),
  classTalentIds: [],
};
let listeners = new Set<() => void>();
let room: Room | null = null;

function emit(): void {
  // Create new reference so useSyncExternalStore detects the change
  state = { ...state, allocations: new Map(state.allocations) };
  for (const fn of listeners) fn();
}

export const talentStore = {
  connect(r: Room): void {
    room = r;

    room.onMessage(MessageType.TALENT_STATE, (data: TalentStateMessage) => {
      state.allocations = new Map();
      for (const a of data.allocations) {
        state.allocations.set(a.talentId, a.rank);
      }
      state.classTalentIds = data.classTalentIds ?? [];
      // Pre-fetch all talent defs for the class
      if (state.classTalentIds.length > 0) {
        talentDefStore.ensureLoaded(state.classTalentIds);
      }
      emit();
    });

    room.onMessage(MessageType.TALENT_ALLOCATED, (data: TalentAllocatedMessage) => {
      state.allocations.set(data.talentId, data.newRank);
      emit();
    });
  },

  allocateTalent(talentId: string): void {
    if (!room) return;
    room.send(MessageType.TALENT_ALLOCATE, { talentId });
  },

  resetTalents(): void {
    if (!room) return;
    room.send(MessageType.TALENT_RESET, {});
  },

  getRank(talentId: string): number {
    return state.allocations.get(talentId) ?? 0;
  },

  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  getSnapshot(): TalentStoreSnapshot {
    return state;
  },

  reset(): void {
    state = { allocations: new Map(), classTalentIds: [] };
    listeners = new Set();
    room = null;
  },
};
