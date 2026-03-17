import { eq } from "drizzle-orm";
import { Hash } from "colyseus";
import { Role } from "@dungeon/shared";
import { initDatabase } from "./database";
import { accounts, characters, items } from "./schema";

interface SeedAccount {
  email: string;
  password: string;
  characterName: string;
  role: string;
}

const SEED_ACCOUNTS: SeedAccount[] = [
  { email: "test@test.com", password: "password", characterName: "Hero", role: Role.USER },
  { email: "admin@admin.com", password: "admin", characterName: "Admin", role: Role.ADMIN },
];

async function seed() {
  const db = await initDatabase();

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

    const hashedPassword = await Hash.make(entry.password);

    const [account] = await db
      .insert(accounts)
      .values({
        email: entry.email,
        password: hashedPassword,
        role: entry.role,
      })
      .returning({ id: accounts.id });

    await db.insert(characters).values({
      accountId: account.id,
      name: entry.characterName,
    });

    console.log(`Created account "${entry.email}" with character "${entry.characterName}"`);
  }

  // Seed world items (upsert)
  await db
    .insert(items)
    .values({
      id: "health_potion",
      name: "items.healthPotion",
      description: "items.healthPotionDesc",
      icon: "potion_red",
      maxStack: 10,
      consumable: true,
      cooldown: 10,
      effectType: "heal",
      effectParams: { amount: 50 },
      useSound: "potion_drink",
    })
    .onConflictDoNothing();
  console.log("World items seeded.");

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
