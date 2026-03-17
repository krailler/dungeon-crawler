import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { PostgresJsTransaction } from "drizzle-orm/postgres-js";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { resolve } from "node:path";
import { logger } from "../logger";
import * as schema from "./schema";

/** Drizzle transaction type for use in function signatures */
export type DbTransaction = PostgresJsTransaction<
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://dungeon:dungeon@localhost:5432/dungeon";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export async function initDatabase(): Promise<ReturnType<typeof drizzle<typeof schema>>> {
  if (db) return db;

  const sql = postgres(DATABASE_URL, {
    max: 10,
    connection: { client_min_messages: "warning" },
  });
  db = drizzle(sql, { schema });

  // Run migrations
  const migrationsFolder = resolve(import.meta.dirname, "../migrations");
  await migrate(db, { migrationsFolder });
  logger.info("Database initialized and migrations applied");

  return db;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) throw new Error("Database not initialized — call initDatabase() first");
  return db;
}
