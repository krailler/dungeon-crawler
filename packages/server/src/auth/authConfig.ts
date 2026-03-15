import { auth, JWT } from "colyseus";
import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { accounts } from "../db/schema";

// JWT secret — use env var in production, dev fallback for local development
JWT.settings.secret = process.env.JWT_SECRET ?? "dungeon-dev-secret-change-in-prod";

auth.settings.onFindUserByEmail = async (email: string) => {
  const db = getDb();
  const [account] = await db.select().from(accounts).where(eq(accounts.email, email)).limit(1);
  if (!account) return null as unknown as { password: string };
  return account;
};

// Registration disabled — accounts are created via seed only
auth.settings.onRegisterWithEmailAndPassword = async () => {
  throw new Error("Registration is disabled");
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
