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
};

type Listener = () => void;

type MemberMap = Map<string, PartyMember>;

const listeners = new Set<Listener>();
const members: MemberMap = new Map();
const order: string[] = [];

let fps = 0;
let cachedSnapshot: HudSnapshot = {
  members: [],
  fps: 0,
};

const rebuildSnapshot = (): void => {
  cachedSnapshot = {
    members: sortedMembers(),
    fps,
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
  setFPS(value: number): void {
    if (fps === value) return;
    fps = value;
    rebuildSnapshot();
    emit();
  },
  reset(): void {
    members.clear();
    order.length = 0;
    fps = 0;
    rebuildSnapshot();
    emit();
  },
};
