import { eq } from "drizzle-orm";
import { Hash } from "colyseus";
import { Role, ItemEffectType, DEFAULT_SKILL_IDS } from "@dungeon/shared";
import type { RoleValue } from "@dungeon/shared";
import { initDatabase } from "./database";
import { accounts, characters, items, skills, characterSkills } from "./schema";

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

    const [character] = await db
      .insert(characters)
      .values({ accountId: account.id, name: entry.characterName })
      .returning({ id: characters.id });

    // Assign default skills to the new character
    await db
      .insert(characterSkills)
      .values(DEFAULT_SKILL_IDS.map((skillId) => ({ characterId: character.id, skillId })));

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
      effectType: ItemEffectType.HEAL,
      effectParams: { amount: 50 },
      useSound: "potion_drink",
    })
    .onConflictDoNothing();
  console.log("World items seeded.");

  // Seed world skills (upsert)
  await db
    .insert(skills)
    .values([
      {
        id: "basic_attack",
        name: "skills.basicAttack",
        description: "skills.basicAttackDesc",
        icon: "sword",
        passive: true,
        cooldown: 0,
        damageMultiplier: 1,
        animState: "punch",
      },
      {
        id: "heavy_strike",
        name: "skills.heavyStrike",
        description: "skills.heavyStrikeDesc",
        icon: "fist",
        passive: false,
        cooldown: 5,
        damageMultiplier: 2.5,
        animState: "heavy_punch",
      },
    ])
    .onConflictDoNothing();
  console.log("World skills seeded.");

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
