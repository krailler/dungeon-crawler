import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";
import type { ItemInstanceClient, InstanceDefsResponseMessage } from "@dungeon/shared";

type Listener = () => void;

const listeners = new Set<Listener>();
const cache = new Map<string, ItemInstanceClient>();
const inflight = new Set<string>();
let pendingBatch: Set<string> | null = null;
let roomRef: Room | null = null;
let cachedSnapshot: ReadonlyMap<string, ItemInstanceClient> = new Map();

function emit(): void {
  cachedSnapshot = new Map(cache);
  for (const listener of listeners) listener();
}

function flushBatch(): void {
  if (!pendingBatch || pendingBatch.size === 0 || !roomRef) {
    pendingBatch = null;
    return;
  }
  const ids = Array.from(pendingBatch);
  pendingBatch = null;
  for (const id of ids) inflight.add(id);
  roomRef.send(MessageType.INSTANCE_DEFS_REQUEST, { instanceIds: ids });
}

function scheduleBatch(id: string): void {
  if (!pendingBatch) {
    pendingBatch = new Set();
    queueMicrotask(flushBatch);
  }
  pendingBatch.add(id);
}

function handleResponse(data: InstanceDefsResponseMessage): void {
  for (const inst of data.instances) {
    cache.set(inst.id, inst);
    inflight.delete(inst.id);
  }
  emit();
}

export const itemInstanceStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): ReadonlyMap<string, ItemInstanceClient> {
    return cachedSnapshot;
  },

  connect(room: Room): void {
    roomRef = room;
    room.onMessage(MessageType.INSTANCE_DEFS_RESPONSE, handleResponse);
  },

  ensureLoaded(ids: string[]): void {
    for (const id of ids) {
      if (!id || cache.has(id) || inflight.has(id)) continue;
      scheduleBatch(id);
    }
  },

  get(id: string): ItemInstanceClient | undefined {
    const inst = cache.get(id);
    if (!inst && id && !inflight.has(id)) {
      scheduleBatch(id);
    }
    return inst;
  },

  reset(): void {
    cache.clear();
    inflight.clear();
    pendingBatch = null;
    roomRef = null;
    cachedSnapshot = new Map();
    emit();
  },
};
