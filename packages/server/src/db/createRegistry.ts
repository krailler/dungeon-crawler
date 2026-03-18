import { getDb } from "./database.js";
import { logger } from "../logger.js";

/** DJB2-style string hash → 32-bit integer */
export function simpleHash(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h;
}

export interface Registry<TDef> {
  load(): Promise<void>;
  get(id: string): TDef | undefined;
  getMany(ids: string[]): TDef[];
  getAll(): TDef[];
  getVersion(): number;
}

interface RegistryConfig<TRow, TDef> {
  /** Drizzle table reference */
  table: Parameters<ReturnType<typeof getDb>["select"]>[0] extends infer _
    ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
      any
    : never;
  /** Human-readable name for logs (e.g. "ItemRegistry") */
  name: string;
  /** Map a DB row to an immutable definition object */
  mapRow: (row: TRow) => TDef;
  /** Return extra numeric bits to mix into the version hash (beyond the id string) */
  hashDef: (def: TDef) => number;
}

/**
 * Factory that creates a singleton registry backed by a DB table.
 * Loaded once at server startup; provides versioned lookup by id.
 */
export function createRegistry<TRow, TDef extends { id: string }>(
  config: RegistryConfig<TRow, TDef>,
): Registry<TDef> {
  const map = new Map<string, TDef>();
  let version = 0;

  return {
    async load(): Promise<void> {
      const db = getDb();
      const rows = (await db.select().from(config.table)) as TRow[];

      map.clear();
      for (const row of rows) {
        const def = config.mapRow(row);
        map.set(def.id, def);
      }

      // Compute version hash from ids + def-specific bits
      let hash = 0;
      for (const [id, def] of map) {
        hash = ((hash << 5) - hash + simpleHash(id)) | 0;
        hash = ((hash << 5) - hash + config.hashDef(def)) | 0;
      }
      version = hash >>> 0;

      logger.info(`${config.name} loaded ${map.size} entry(ies), version=${version}`);
    },

    get(id: string): TDef | undefined {
      return map.get(id);
    },

    getMany(ids: string[]): TDef[] {
      const result: TDef[] = [];
      for (const id of ids) {
        const def = map.get(id);
        if (def) result.push(def);
      }
      return result;
    },

    getAll(): TDef[] {
      return Array.from(map.values());
    },

    getVersion(): number {
      return version;
    },
  };
}
