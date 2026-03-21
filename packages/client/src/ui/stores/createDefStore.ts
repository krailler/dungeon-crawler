import type { Room } from "@colyseus/sdk";

type Listener = () => void;

interface DefStoreConfig {
  /** MessageType value for the request (e.g. "skill:defs:req") */
  requestType: string;
  /** MessageType value for the response (e.g. "skill:defs:res") */
  responseType: string;
  /** Key in the request payload containing the id array (e.g. "skillIds") */
  requestKey: string;
  /** Key in the response payload containing the def array (e.g. "skills") */
  responseKey: string;
}

export interface DefStore<TDef extends { id: string }> {
  subscribe(listener: Listener): () => void;
  getSnapshot(): ReadonlyMap<string, TDef>;
  /** Connect the store to a Colyseus room — call once after joining */
  connect(room: Room): void;
  /**
   * Ensure definitions are loaded for the given ids.
   * Unknown ids are batched and requested from the server.
   * Returns immediately — UI re-renders when defs arrive.
   */
  ensureLoaded(ids: string[]): void;
  /**
   * Ensure loaded + return a promise that resolves when all are cached.
   * Useful during loading screen.
   */
  ensureLoadedAsync(ids: string[]): Promise<void>;
  get(id: string): TDef | undefined;
  reset(): void;
}

/**
 * Factory that creates a lazy-loading pub-sub store for server definitions.
 * Uses microtick batching to coalesce multiple requests into a single message.
 */
export function createDefStore<TDef extends { id: string }>(
  config: DefStoreConfig,
): DefStore<TDef> {
  const listeners = new Set<Listener>();
  const cache = new Map<string, TDef>();

  /** Set of ids currently being fetched (in-flight) */
  const inflight = new Set<string>();

  /** Pending batch: ids to request in the next microtick */
  let pendingBatch: Set<string> | null = null;

  /** Callbacks waiting for specific ids to resolve */
  const waiters = new Map<string, Array<() => void>>();

  /** Cache version from server — if it changes, invalidate all cached defs */
  let cacheVersion: number | null = null;

  /** Colyseus room ref — set once on connect */
  let roomRef: Room | null = null;

  let cachedSnapshot: ReadonlyMap<string, TDef> = new Map();

  const emit = (): void => {
    cachedSnapshot = new Map(cache);
    for (const listener of listeners) listener();
  };

  function flushBatch(): void {
    if (!pendingBatch || pendingBatch.size === 0) {
      pendingBatch = null;
      return;
    }
    if (!roomRef) return; // keep batch for retry when room connects
    const ids = Array.from(pendingBatch);
    pendingBatch = null;

    // Mark as in-flight
    for (const id of ids) inflight.add(id);

    roomRef.send(config.requestType, { [config.requestKey]: ids });
  }

  function scheduleBatch(id: string): void {
    if (!pendingBatch) {
      pendingBatch = new Set();
      // Flush on next microtick — batches all requests in the same frame
      queueMicrotask(flushBatch);
    }
    pendingBatch.add(id);
  }

  function handleResponse(data: Record<string, unknown>): void {
    const version = data.version as number;
    const defs = data[config.responseKey] as TDef[];

    // Version check — if server version changed, invalidate entire cache
    if (cacheVersion !== null && version !== cacheVersion) {
      cache.clear();
    }
    cacheVersion = version;

    for (const def of defs) {
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

  return {
    subscribe(listener: Listener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot(): ReadonlyMap<string, TDef> {
      return cachedSnapshot;
    },

    connect(room: Room): void {
      roomRef = room;
      room.onMessage(config.responseType, handleResponse);
    },

    ensureLoaded(ids: string[]): void {
      for (const id of ids) {
        if (cache.has(id) || inflight.has(id)) continue;
        scheduleBatch(id);
      }
    },

    ensureLoadedAsync(ids: string[]): Promise<void> {
      const missing = ids.filter((id) => !cache.has(id));
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

    get(id: string): TDef | undefined {
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
}
