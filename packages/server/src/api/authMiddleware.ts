import { JWT } from "colyseus";
import { eq } from "drizzle-orm";
import { getDb } from "../db/database";
import { characters } from "../db/schema";

export interface AuthenticatedRequest {
  accountId: string;
  characterId: string;
}

/**
 * Verify JWT and resolve characterId from the :characterId param.
 * Returns the auth info or sends an error response and returns null.
 */
export async function authenticateRequest(
  req: { headers: { authorization?: string }; params: { characterId?: string } },
  res: { status: (code: number) => { json: (body: unknown) => void } },
): Promise<AuthenticatedRequest | null> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  let accountId: string;
  try {
    const payload = (await JWT.verify(header.slice(7))) as { accountId?: string };
    if (!payload?.accountId) {
      res.status(401).json({ error: "Invalid token" });
      return null;
    }
    accountId = payload.accountId;
  } catch {
    res.status(401).json({ error: "Invalid token" });
    return null;
  }

  const characterId = req.params.characterId;
  if (!characterId) {
    res.status(400).json({ error: "Missing characterId" });
    return null;
  }

  // Verify character belongs to this account
  // Verify character exists and belongs to this account
  const db = getDb();
  const [char] = await db
    .select({ id: characters.id, accountId: characters.accountId })
    .from(characters)
    .where(eq(characters.id, characterId))
    .limit(1);

  if (!char || char.accountId !== accountId) {
    res.status(404).json({ error: "Character not found" });
    return null;
  }

  return { accountId, characterId };
}
