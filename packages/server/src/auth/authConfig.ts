import { auth, JWT } from "colyseus";
import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { accounts, characters } from "../db/schema";
import { createAccount } from "./createAccount";

// JWT secret — required in production, dev fallback for local development
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET environment variable is required in production");
}
JWT.settings.secret = process.env.JWT_SECRET ?? "dungeon-dev-secret-change-in-prod";

auth.settings.onFindUserByEmail = async (email: string) => {
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  // Colyseus auth expects null when user is not found
  if (!account) return null!;
  return account;
};

// Registration — only allowed in dev mode, auto-creates account + character
auth.settings.onRegisterWithEmailAndPassword = async (email: string, password: string) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Registration is disabled");
  }

  // Derive character name from email: "test@domain.com" → "Test"
  const raw = email.split("@")[0];
  const charName = raw.charAt(0).toUpperCase() + raw.slice(1);

  const account = await createAccount({ email, password, characterName: charName });
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
  const [row] = await db
    .select({
      id: accounts.id,
      email: accounts.email,
      role: accounts.role,
      characterId: characters.id,
      characterName: characters.name,
      characterClass: characters.classId,
      characterLevel: characters.level,
    })
    .from(accounts)
    .leftJoin(characters, eq(characters.accountId, accounts.id))
    .where(eq(accounts.id, accountId))
    .limit(1);
  return row ?? null;
};
