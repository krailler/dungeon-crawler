import type { StatScaling } from "./Stats.js";

/** Character class definition loaded from the database at server startup */
export type ClassDef = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly scaling: StatScaling;
  readonly skillIds: string[];
};

/** Skill entry with unlock metadata for the client spellbook */
export type ClassSkillEntry = {
  readonly skillId: string;
  readonly unlockLevel: number;
  readonly isDefault: boolean;
};

/** Presentation-only class info sent to the client */
export type ClassDefClient = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly skills: ClassSkillEntry[];
};

/** Strip server-only fields from a ClassDef for client consumption */
export function toClassDefClient(def: ClassDef, skillEntries?: ClassSkillEntry[]): ClassDefClient {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
    skills: skillEntries ?? [],
  };
}
