import { Hash } from "colyseus";
import { eq } from "drizzle-orm";
import { getDb } from "../db/database.js";
import { accounts, characters, characterSkills, classSkills } from "../db/schema.js";
import type { RoleValue } from "@dungeon/shared";

interface CreateAccountParams {
  email: string;
  password: string;
  characterName: string;
  role?: RoleValue;
  classId?: string;
}

/**
 * Create a new account + character + class skills.
 * Reads skill ids from the class_skills table for the given class.
 */
export async function createAccount(params: CreateAccountParams) {
  const { email, password, characterName, role = "user", classId = "warrior" } = params;
  const db = getDb();
  const hashedPassword = await Hash.make(password);

  const [account] = await db
    .insert(accounts)
    .values({ email, password: hashedPassword, role })
    .returning();

  const [character] = await db
    .insert(characters)
    .values({ accountId: account.id, name: characterName, classId })
    .returning({ id: characters.id });

  // Assign skills from the class definition
  const skills = await db
    .select({ skillId: classSkills.skillId })
    .from(classSkills)
    .where(eq(classSkills.classId, classId));

  if (skills.length > 0) {
    await db
      .insert(characterSkills)
      .values(skills.map((s) => ({ characterId: character.id, skillId: s.skillId })));
  }

  return account;
}
