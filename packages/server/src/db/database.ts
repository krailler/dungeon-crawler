import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { logger } from "../logger";
import * as schema from "./schema";

const DB_PATH = process.env.DATABASE_PATH ?? "./data/dungeon.db";

let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function initDatabase(): ReturnType<typeof drizzle<typeof schema>> {
  if (db) return db;

  // Ensure data directory exists
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const sqlite = new Database(DB_PATH);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  db = drizzle(sqlite, { schema });

  // Run migrations
  const migrationsFolder = resolve(import.meta.dirname, "../migrations");
  migrate(db, { migrationsFolder });
  logger.info("Database initialized and migrations applied");

  return db;
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
  if (!db) throw new Error("Database not initialized — call initDatabase() first");
  return db;
}
