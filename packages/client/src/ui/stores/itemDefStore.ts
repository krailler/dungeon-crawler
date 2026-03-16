import type { ItemDef, ItemDefsResponseMessage } from "@dungeon/shared";
import { MessageType } from "@dungeon/shared";
import type { Room } from "@colyseus/sdk";

type Listener = () => void;

const listeners = new Set<Listener>();
const cache = new Map<string, ItemDef>();

/** Set of item ids currently being fetched (in-flight) */
const inflight = new Set<string>();

/** Pending batch: ids to request in the next microtick */
let pendingBatch: Set<string> | null = null;

/** Callbacks waiting for specific ids to resolve */
const waiters = new Map<string, Array<() => void>>();

/** Cache version from server — if it changes, invalidate all cached defs */
let cacheVersion: number | null = null;

/** Colyseus room ref — set once on connect */
let roomRef: Room | null = null;

let cachedSnapshot: ReadonlyMap<string, ItemDef> = new Map();

const emit = (): void => {
  cachedSnapshot = new Map(cache);
  for (const listener of listeners) listener();
};

function flushBatch(): void {
  if (!pendingBatch || pendingBatch.size === 0 || !roomRef) {
    pendingBatch = null;
    return;
  }
  const ids = Array.from(pendingBatch);
  pendingBatch = null;

  // Mark as in-flight
  for (const id of ids) inflight.add(id);

  roomRef.send(MessageType.ITEM_DEFS_REQUEST, { itemIds: ids });
}

function scheduleBatch(itemId: string): void {
  if (!pendingBatch) {
    pendingBatch = new Set();
    // Flush on next microtick — batches all requests in the same frame
    queueMicrotask(flushBatch);
  }
  pendingBatch.add(itemId);
}

function handleResponse(data: ItemDefsResponseMessage): void {
  // Version check — if server version changed, invalidate entire cache
  if (cacheVersion !== null && data.version !== cacheVersion) {
    cache.clear();
  }
  cacheVersion = data.version;

  for (const def of data.items) {
    cache.set(def.id, def);
    inflight.delete(def.id);

    // Resolve waiters
    const callbacks = waiters.get(def.id);
    if (callbacks) {
      for (const cb of callbacks) cb();
      waiters.delete(def.id);
    }
  }

  emit();
}

export const itemDefStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): ReadonlyMap<string, ItemDef> {
    return cachedSnapshot;
  },

  /** Connect the store to a Colyseus room — call once after joining */
  connect(room: Room): void {
    roomRef = room;
    room.onMessage(MessageType.ITEM_DEFS_RESPONSE, handleResponse);
  },

  /**
   * Ensure item definitions are loaded for the given ids.
   * Unknown ids are batched and requested from the server.
   * Returns immediately — UI re-renders when defs arrive.
   */
  ensureLoaded(itemIds: string[]): void {
    for (const id of itemIds) {
      if (cache.has(id) || inflight.has(id)) continue;
      scheduleBatch(id);
    }
  },

  /**
   * Ensure loaded + return a promise that resolves when all are cached.
   * Useful during loading screen.
   */
  ensureLoadedAsync(itemIds: string[]): Promise<void> {
    const missing = itemIds.filter((id) => !cache.has(id));
    if (missing.length === 0) return Promise.resolve();

    this.ensureLoaded(missing);

    return new Promise((resolve) => {
      const check = (): void => {
        if (missing.every((id) => cache.has(id))) {
          resolve();
          return;
        }
        // Register waiters for remaining missing ids
        for (const id of missing) {
          if (!cache.has(id)) {
            let arr = waiters.get(id);
            if (!arr) {
              arr = [];
              waiters.set(id, arr);
            }
            arr.push(check);
            return; // will be called again when this id resolves
          }
        }
      };
      check();
    });
  },

  get(id: string): ItemDef | undefined {
    const def = cache.get(id);
    // Auto-fetch unknown defs on access
    if (!def && !inflight.has(id)) {
      scheduleBatch(id);
    }
    return def;
  },

  reset(): void {
    cache.clear();
    inflight.clear();
    pendingBatch = null;
    waiters.clear();
    cacheVersion = null;
    roomRef = null;
    cachedSnapshot = new Map();
    emit();
  },
};
