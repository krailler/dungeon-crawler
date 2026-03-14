import { randomUUID } from "node:crypto";
import { auth, Hash, JWT } from "colyseus";
import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { accounts, characters } from "../db/schema";

// JWT secret — use env var in production, dev fallback for local development
JWT.settings.secret = process.env.JWT_SECRET ?? "dungeon-dev-secret-change-in-prod";

auth.settings.onFindUserByEmail = async (email: string) => {
  const db = getDb();
  const account = db.select().from(accounts).where(eq(accounts.email, email)).get();
  if (!account) return null as unknown as { password: string };
  return account;
};

auth.settings.onRegisterWithEmailAndPassword = async (
  email: string,
  password: string,
  options: { displayName?: string },
) => {
  const db = getDb();
  const now = Date.now();
  const accountId = randomUUID();
  const characterId = randomUUID();
  const hashedPassword = await Hash.make(password);

  db.insert(accounts)
    .values({
      id: accountId,
      email,
      password: hashedPassword,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  db.insert(characters)
    .values({
      id: characterId,
      accountId,
      name: options.displayName ?? "Hero",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  return { id: accountId, email };
};

auth.settings.onGenerateToken = async (userdata: unknown) => {
  const user = userdata as { id: string; email: string; role: string };
  return await JWT.sign({ accountId: user.id, email: user.email, role: user.role });
};

auth.settings.onParseToken = async (token) => {
  const { accountId } = token as Record<string, string>;
  if (!accountId) return null;
  const db = getDb();
  const account = db
    .select({ id: accounts.id, email: accounts.email })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  return account ?? null;
};
