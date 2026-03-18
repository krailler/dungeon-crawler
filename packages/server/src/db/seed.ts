import { eq } from "drizzle-orm";
import { Role } from "@dungeon/shared";
import type { RoleValue } from "@dungeon/shared";
import { initDatabase, getDb } from "./database";
import { accounts } from "./schema";
import { createAccount } from "../auth/createAccount";

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
      console.log(`Account "${entry.email}" already exists — skipping.`);
      continue;
    }

    await createAccount({
      email: entry.email,
      password: entry.password,
      characterName: entry.characterName,
      role: entry.role,
    });

    console.log(`Created account "${entry.email}" with character "${entry.characterName}"`);
  }

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
