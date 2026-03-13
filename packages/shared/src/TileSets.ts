/**
 * Registry of known floor tile sets.
 * Adding a new set = add one entry here + drop 8 GLBs in public/models/floors/<key>/
 */
export const TILE_SETS = {
  set1: { id: 1, name: "Castle Stone", variants: 8 },
} as const;

export type TileSetName = keyof typeof TILE_SETS;

/** All registered set names, useful for iteration */
export const TILE_SET_NAMES: TileSetName[] = Object.keys(TILE_SETS) as TileSetName[];

/** Look up a set's key name from its numeric ID. Returns null if not found. */
export function tileSetNameFromId(id: number): TileSetName | null {
  for (const [name, def] of Object.entries(TILE_SETS)) {
    if (def.id === id) return name as TileSetName;
  }
  return null;
}
