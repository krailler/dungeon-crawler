import { auth, Hash, JWT } from "colyseus";
import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { accounts, characters } from "../db/schema";

// JWT secret — use env var in production, dev fallback for local development
JWT.settings.secret = process.env.JWT_SECRET ?? "dungeon-dev-secret-change-in-prod";

auth.settings.onFindUserByEmail = async (email: string) => {
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account) return null as unknown as { password: string };
  return account;
};

auth.settings.onRegisterWithEmailAndPassword = async (
  email: string,
  password: string,
  options: { displayName?: string },
) => {
  const db = getDb();
  const hashedPassword = await Hash.make(password);

  const [account] = await db
    .insert(accounts)
    .values({
      email,
      password: hashedPassword,
    })
    .returning({ id: accounts.id, email: accounts.email });

  await db.insert(characters).values({
    accountId: account.id,
    name: options.displayName ?? "Hero",
  });

  return { id: account.id, email: account.email };
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
