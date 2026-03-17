import { auth, Hash, JWT } from "colyseus";
import { eq } from "drizzle-orm";
import { DEFAULT_SKILL_IDS } from "@dungeon/shared";
import { getDb } from "../db/database";
import { accounts, characters, characterSkills } from "../db/schema";

// JWT secret — use env var in production, dev fallback for local development
JWT.settings.secret = process.env.JWT_SECRET ?? "dungeon-dev-secret-change-in-prod";

auth.settings.onFindUserByEmail = async (email: string) => {
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account) return null as unknown as { password: string };
  return account;
};

// Registration — only allowed in dev mode, auto-creates account + character
auth.settings.onRegisterWithEmailAndPassword = async (email: string, password: string) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Registration is disabled");
  }
  if (process.env.NODE_ENV === "production" && password.length < 4) {
    throw new Error("Password must be at least 4 characters");
  }

  const db = getDb();
  const hashedPassword = await Hash.make(password);

  // Derive character name from email: "test@domain.com" → "Test"
  const raw = email.split("@")[0];
  const charName = raw.charAt(0).toUpperCase() + raw.slice(1);

  const [account] = await db
    .insert(accounts)
    .values({ email, password: hashedPassword, role: "user" })
    .returning();

  const [character] = await db
    .insert(characters)
    .values({ accountId: account.id, name: charName })
    .returning({ id: characters.id });

  // Assign default skills to the new character
  await db
    .insert(characterSkills)
    .values(DEFAULT_SKILL_IDS.map((skillId) => ({ characterId: character.id, skillId })));

  console.log(`[Auth] Auto-created account "${email}" with character "${charName}"`);
  return account;
};

auth.settings.onGenerateToken = async (userdata: unknown) => {
  const user = userdata as { id: string; email: string; role: string };
  return await JWT.sign({ accountId: user.id, email: user.email, role: user.role });
};

auth.settings.onParseToken = async (token) => {
  const { accountId } = token as Record<string, string>;
  if (!accountId) return null;
  const db = getDb();
  const [account] = await db
    .select({ id: accounts.id, email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .limit(1);
  return account ?? null;
};
