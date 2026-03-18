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

/** Presentation-only class info sent to the client */
export type ClassDefClient = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
};

/** Strip server-only fields from a ClassDef for client consumption */
export function toClassDefClient(def: ClassDef): ClassDefClient {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    icon: def.icon,
  };
}
