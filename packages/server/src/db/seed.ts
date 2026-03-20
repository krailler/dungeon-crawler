import { eq } from "drizzle-orm";
import { Role } from "@dungeon/shared";
import type { RoleValue } from "@dungeon/shared";
import { initDatabase, getDb } from "./database";
import { accounts } from "./schema";
import { createAccount } from "../auth/createAccount";
import { logger } from "../logger";

interface SeedAccount {
  email: string;
  password: string;
  characterName: string;
  role: RoleValue;
}

const SEED_ACCOUNTS: SeedAccount[] = [
  { email: "test@test.com", password: "password", characterName: "Hero", role: Role.USER },
  { email: "admin@admin.com", password: "admin", characterName: "Admin", role: Role.ADMIN },
];

async function seed() {
  await initDatabase();
  const db = getDb();

  for (const entry of SEED_ACCOUNTS) {
    const existing = await db
      .select()
      .from(accounts)
      .where(eq(accounts.email, entry.email))
      .limit(1);
    if (existing.length > 0) {
      logger.info({ email: entry.email }, "Account already exists — skipping");
      continue;
    }

    await createAccount({
      email: entry.email,
      password: entry.password,
      characterName: entry.characterName,
      role: entry.role,
    });

    logger.info({ email: entry.email, character: entry.characterName }, "Created account");
  }

  logger.info("Seed complete");
  process.exit(0);
}

seed().catch((err) => {
  logger.error(err, "Seed failed");
  process.exit(1);
});
