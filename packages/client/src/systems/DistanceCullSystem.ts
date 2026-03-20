import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

/** Distance beyond which dungeon geometry is fully disabled (mesh.setEnabled(false)) */
const CULL_RADIUS = 20;
/** Spatial grid cell size — matches WallOcclusionSystem for consistency */
const GRID_CELL_SIZE = 10;

/**
 * Disables floor tiles and wall decorations that are far from the player.
 * Uses a spatial grid with cell-level activation for O(1) per-frame cost
 * (only border cells are toggled when the player moves between cells).
 */
export class DistanceCullSystem {
  /** Spatial grid: cell key → nodes in that cell */
  private grid: Map<number, TransformNode[]> = new Map();
  /** Currently active (enabled) cells */
  private activeCells: Set<number> = new Set();
  /** Cell range to check around the player */
  private range: number;

  constructor(
    floorRoots: TransformNode[],
    wallDecoRoots: TransformNode[],
    initialPlayerX: number,
    initialPlayerZ: number,
  ) {
    this.range = Math.ceil(CULL_RADIUS / GRID_CELL_SIZE);

    // Build spatial grid from all cullable nodes
    for (const root of floorRoots) {
      this.addToGrid(root, root.position.x, root.position.z);
    }
    for (const deco of wallDecoRoots) {
      this.addToGrid(deco, deco.position.x, deco.position.z);
    }

    // Start with everything disabled, then enable nearby cells immediately
    for (const bucket of this.grid.values()) {
      for (const node of bucket) {
        node.setEnabled(false);
      }
    }
    this.update(initialPlayerX, initialPlayerZ);
  }

  private cellKey(x: number, z: number): number {
    const cx = Math.floor(x / GRID_CELL_SIZE);
    const cz = Math.floor(z / GRID_CELL_SIZE);
    return cx * 10007 + cz;
  }

  private addToGrid(node: TransformNode, x: number, z: number): void {
    const key = this.cellKey(x, z);
    let bucket = this.grid.get(key);
    if (!bucket) {
      bucket = [];
      this.grid.set(key, bucket);
    }
    bucket.push(node);
  }

  update(playerX: number, playerZ: number): void {
    const pcx = Math.floor(playerX / GRID_CELL_SIZE);
    const pcz = Math.floor(playerZ / GRID_CELL_SIZE);
    const range = this.range;

    // Compute the new set of active cells
    const newActive = new Set<number>();
    for (let dx = -range; dx <= range; dx++) {
      for (let dz = -range; dz <= range; dz++) {
        const key = (pcx + dx) * 10007 + (pcz + dz);
        if (this.grid.has(key)) {
          newActive.add(key);
        }
      }
    }

    // Enable nodes in newly active cells
    for (const key of newActive) {
      if (!this.activeCells.has(key)) {
        const bucket = this.grid.get(key)!;
        for (const node of bucket) node.setEnabled(true);
      }
    }

    // Disable nodes in deactivated cells
    for (const key of this.activeCells) {
      if (!newActive.has(key)) {
        const bucket = this.grid.get(key);
        if (bucket) {
          for (const node of bucket) node.setEnabled(false);
        }
      }
    }

    this.activeCells = newActive;
  }

  dispose(): void {
    // Re-enable all nodes so disposal doesn't leave hidden meshes
    for (const bucket of this.grid.values()) {
      for (const node of bucket) node.setEnabled(true);
    }
    this.activeCells.clear();
    this.grid.clear();
  }
}
