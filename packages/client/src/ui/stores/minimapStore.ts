import type { TileMap } from "@dungeon/shared";

export type MinimapSnapshot = {
  visible: boolean;
  version: number;
};

type Listener = () => void;

const listeners = new Set<Listener>();

let tileMap: TileMap | null = null;
let discovered: Set<number> = new Set();
let playerPositions: Map<string, { x: number; z: number }> = new Map();
let creaturePositions: Map<string, { x: number; z: number }> = new Map();
let localSessionId: string = "";
let visible = false;
let version = 0;
let gatePositions: Map<string, { x: number; y: number }> = new Map();
let dirty = false;
let lastRevealTileX = -999;
let lastRevealTileY = -999;

let cachedSnapshot: MinimapSnapshot = { visible: false, version: 0 };

const rebuildSnapshot = (): void => {
  cachedSnapshot = { visible, version };
};

const emit = (): void => {
  for (const listener of listeners) {
    listener();
  }
};

export const minimapStore = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  getSnapshot(): MinimapSnapshot {
    return cachedSnapshot;
  },

  toggle(): void {
    visible = !visible;
    rebuildSnapshot();
    emit();
  },

  setTileMap(map: TileMap): void {
    tileMap = map;
    discovered = new Set();
    gatePositions = new Map();
    creaturePositions = new Map();
    lastRevealTileX = -999;
    lastRevealTileY = -999;
    dirty = true;
  },

  addGatePosition(id: string, x: number, y: number): void {
    gatePositions.set(id, { x, y });
    dirty = true;
  },

  removeGatePosition(id: string): void {
    gatePositions.delete(id);
    dirty = true;
  },

  getGatePositions(): Map<string, { x: number; y: number }> {
    return gatePositions;
  },

  setLocalSessionId(id: string): void {
    localSessionId = id;
  },

  /** Silently updates a player position — call flush() once per frame to emit */
  updatePlayerPosition(id: string, x: number, z: number): void {
    playerPositions.set(id, { x, z });
    dirty = true;
  },

  removePlayer(id: string): void {
    playerPositions.delete(id);
    dirty = true;
  },

  /** Replace active creature positions each frame (only active creatures are passed) */
  setActiveCreatures(active: Map<string, { x: number; z: number }>): void {
    creaturePositions = active;
    dirty = true;
  },

  revealAround(tileX: number, tileY: number, radius: number): void {
    if (!tileMap) return;
    // Skip if player hasn't moved to a different tile
    if (tileX === lastRevealTileX && tileY === lastRevealTileY) return;
    lastRevealTileX = tileX;
    lastRevealTileY = tileY;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tx = tileX + dx;
        const ty = tileY + dy;
        if (tx < 0 || tx >= tileMap.width || ty < 0 || ty >= tileMap.height) continue;
        // Circle check
        if (dx * dx + dy * dy > radius * radius) continue;
        const key = ty * tileMap.width + tx;
        if (!discovered.has(key)) {
          discovered.add(key);
          dirty = true;
        }
      }
    }
  },

  /** Emit a single update per frame (called at end of game loop) */
  flush(): void {
    if (!dirty || !visible) return;
    dirty = false;
    version++;
    rebuildSnapshot();
    emit();
  },

  // Direct accessors for Canvas rendering (not in snapshot for perf)
  getTileMap(): TileMap | null {
    return tileMap;
  },

  getDiscovered(): Set<number> {
    return discovered;
  },

  getPlayerPositions(): Map<string, { x: number; z: number }> {
    return playerPositions;
  },

  getLocalSessionId(): string {
    return localSessionId;
  },

  getCreaturePositions(): Map<string, { x: number; z: number }> {
    return creaturePositions;
  },

  revealAll(): void {
    if (!tileMap) return;
    for (let y = 0; y < tileMap.height; y++) {
      for (let x = 0; x < tileMap.width; x++) {
        discovered.add(y * tileMap.width + x);
      }
    }
    dirty = true;
  },

  reset(): void {
    tileMap = null;
    gatePositions = new Map();
    discovered = new Set();
    playerPositions = new Map();
    creaturePositions = new Map();
    localSessionId = "";
    visible = false;
    version = 0;
    lastRevealTileX = -999;
    lastRevealTileY = -999;
    rebuildSnapshot();
    emit();
  },
};
