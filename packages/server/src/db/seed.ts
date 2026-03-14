import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Hash } from "colyseus";
import { initDatabase } from "./database";
import { accounts, characters } from "./schema";

interface SeedAccount {
  email: string;
  password: string;
  characterName: string;
  role: string;
}

const SEED_ACCOUNTS: SeedAccount[] = [
  { email: "test@test.com", password: "password", characterName: "Hero", role: "user" },
  { email: "admin@admin.com", password: "admin", characterName: "Admin", role: "admin" },
];

async function seed() {
  const db = initDatabase();
  const now = Date.now();

  for (const entry of SEED_ACCOUNTS) {
    const existing = db.select().from(accounts).where(eq(accounts.email, entry.email)).get();
    if (existing) {
      console.log(`Account "${entry.email}" already exists — skipping.`);
      continue;
    }

    const accountId = randomUUID();
    const characterId = randomUUID();
    const hashedPassword = await Hash.make(entry.password);

    db.insert(accounts)
      .values({
        id: accountId,
        email: entry.email,
        password: hashedPassword,
        role: entry.role,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    db.insert(characters)
      .values({
        id: characterId,
        accountId,
        name: entry.characterName,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    console.log(`Created account "${entry.email}" with character "${entry.characterName}"`);
  }
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
