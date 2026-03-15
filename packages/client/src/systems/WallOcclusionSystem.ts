import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

const OCCLUDE_RADIUS = 10;
const OCCLUDE_RADIUS_SQ = OCCLUDE_RADIUS * OCCLUDE_RADIUS;
const FADED_ALPHA = 0.12;
/** Spatial grid cell size — matches occlusion radius for efficient 3×3 lookup */
const GRID_CELL_SIZE = OCCLUDE_RADIUS;

type WallFace = "n" | "s" | "w" | "e";

export class WallOcclusionSystem {
  /** Original shared material + per-mesh faded clone */
  private decoMaterialCache: Map<AbstractMesh, { original: Material; faded: Material }> = new Map();
  /** Track which walls are currently faded (directly or via corner propagation) */
  private fadedWalls: Set<Mesh> = new Set();
  private camera: ArcRotateCamera;
  /** Map from wall cap → decoration root nodes (faded with wall) */
  private wallDecoMap: Map<Mesh, TransformNode[]>;
  /** Spatial grid: cell key → walls in that cell */
  private grid: Map<number, Mesh[]> = new Map();
  /** Pre-computed corner neighbors for each wall mesh */
  private cornerNeighbors: Map<Mesh, Mesh[]> = new Map();

  constructor(
    _scene: Scene,
    camera: ArcRotateCamera,
    wallMeshes: Mesh[],
    wallDecoMap: Map<Mesh, TransformNode[]>,
  ) {
    this.camera = camera;
    this.wallDecoMap = wallDecoMap;

    // Build spatial grid — walls never move so this is done once
    for (const wall of wallMeshes) {
      const key = this.cellKey(wall.position.x, wall.position.z);
      let bucket = this.grid.get(key);
      if (!bucket) {
        bucket = [];
        this.grid.set(key, bucket);
      }
      bucket.push(wall);
    }

    // Pre-compute corner neighbors
    this.buildCornerNeighbors(wallMeshes);
  }

  /**
   * Build a lookup of perpendicular walls that share a corner vertex.
   *
   * Wall names follow the pattern `wall_{tileX}_{tileY}_{face}`.
   * For each wall we find perpendicular walls on the same or adjacent tiles
   * that share a corner point — these should fade together to avoid
   * a solid wall sticking out at L-corners.
   */
  private buildCornerNeighbors(wallMeshes: Mesh[]): void {
    // Index walls by tile+face key
    const byKey = new Map<string, Mesh>();
    const wallInfo = new Map<Mesh, { tx: number; ty: number; face: WallFace }>();

    for (const wall of wallMeshes) {
      const parsed = this.parseWallName(wall.name);
      if (!parsed) continue;
      const { tx, ty, face } = parsed;
      byKey.set(`${tx}_${ty}_${face}`, wall);
      wallInfo.set(wall, { tx, ty, face });
    }

    // For each wall, find perpendicular neighbors that share a corner vertex
    for (const wall of wallMeshes) {
      const info = wallInfo.get(wall);
      if (!info) continue;
      const { tx, ty, face } = info;
      const neighbors: Mesh[] = [];

      if (face === "n" || face === "s") {
        // Horizontal wall — look for vertical (e/w) walls at corner tiles
        // Same tile: perpendicular faces
        this.addIfExists(byKey, `${tx}_${ty}_w`, neighbors);
        this.addIfExists(byKey, `${tx}_${ty}_e`, neighbors);

        // Cross-tile: vertical walls on left/right neighboring tiles
        // Left neighbor's east face shares the left corner
        this.addIfExists(byKey, `${tx - 1}_${ty}_e`, neighbors);
        // Right neighbor's west face shares the right corner
        this.addIfExists(byKey, `${tx + 1}_${ty}_w`, neighbors);
      } else {
        // Vertical wall — look for horizontal (n/s) walls at corner tiles
        // Same tile: perpendicular faces
        this.addIfExists(byKey, `${tx}_${ty}_n`, neighbors);
        this.addIfExists(byKey, `${tx}_${ty}_s`, neighbors);

        // Cross-tile: horizontal walls on top/bottom neighboring tiles
        // Top neighbor's south face shares the top corner
        this.addIfExists(byKey, `${tx}_${ty - 1}_s`, neighbors);
        // Bottom neighbor's north face shares the bottom corner
        this.addIfExists(byKey, `${tx}_${ty + 1}_n`, neighbors);
      }

      if (neighbors.length > 0) {
        this.cornerNeighbors.set(wall, neighbors);
      }
    }
  }

  /** Parse wall mesh name `wall_5_10_n` → { tx: 5, ty: 10, face: "n" } */
  private parseWallName(name: string): { tx: number; ty: number; face: WallFace } | null {
    const match = name.match(/^wall_(\d+)_(\d+)_([nswe])$/);
    if (!match) return null;
    return {
      tx: parseInt(match[1], 10),
      ty: parseInt(match[2], 10),
      face: match[3] as WallFace,
    };
  }

  private addIfExists(byKey: Map<string, Mesh>, key: string, out: Mesh[]): void {
    const mesh = byKey.get(key);
    if (mesh) out.push(mesh);
  }

  /** Compute grid cell key from world coordinates */
  private cellKey(x: number, z: number): number {
    const cx = Math.floor(x / GRID_CELL_SIZE);
    const cz = Math.floor(z / GRID_CELL_SIZE);
    // Use prime multiplier to reduce hash collisions
    return cx * 10007 + cz;
  }

  update(playerX: number, playerZ: number): void {
    const camPos = this.camera.position;
    const camTarget = this.camera.target;
    // Camera look direction projected on XZ plane
    const dirX = camTarget.x - camPos.x;
    const dirZ = camTarget.z - camPos.z;
    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
    const normX = dirX / dirLen;
    const normZ = dirZ / dirLen;

    // Collect which walls should be faded this frame
    const shouldFade: Set<Mesh> = new Set();

    // Only check walls in the 3×3 grid cells around the player
    const pcx = Math.floor(playerX / GRID_CELL_SIZE);
    const pcz = Math.floor(playerZ / GRID_CELL_SIZE);

    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const key = (pcx + dx) * 10007 + (pcz + dz);
        const bucket = this.grid.get(key);
        if (!bucket) continue;

        for (const wall of bucket) {
          const wx = wall.position.x - playerX;
          const wz = wall.position.z - playerZ;
          const distSq = wx * wx + wz * wz;

          if (distSq > OCCLUDE_RADIUS_SQ) continue;

          // Negative dot = wall is between camera and player
          const dot = wx * normX + wz * normZ;

          // Only fade walls whose exposed face points TOWARD the camera.
          const meta = wall.metadata as {
            floorN: boolean;
            floorS: boolean;
            floorW: boolean;
            floorE: boolean;
          } | null;

          let facesCamera = true; // fallback: fade if no metadata
          if (meta) {
            facesCamera =
              (meta.floorS && normZ > 0) || // south face blocks camera from -Z
              (meta.floorN && normZ < 0) || // north face blocks camera from +Z
              (meta.floorE && normX > 0) || // east face blocks camera from -X
              (meta.floorW && normX < 0); // west face blocks camera from +X
          }

          if (dot < 0 && facesCamera) {
            shouldFade.add(wall);
          }
        }
      }
    }

    // Propagate to corner neighbors: if a wall is faded, also fade
    // perpendicular walls that share a corner vertex (L-corner propagation)
    for (const wall of shouldFade) {
      const neighbors = this.cornerNeighbors.get(wall);
      if (!neighbors) continue;
      for (const neighbor of neighbors) {
        shouldFade.add(neighbor);
      }
    }

    // Apply: fade walls that should be faded, restore those that shouldn't
    for (const wall of shouldFade) {
      this.fadeWall(wall);
    }

    // Restore walls that are currently faded but shouldn't be anymore
    for (const wall of this.fadedWalls) {
      if (!shouldFade.has(wall)) {
        this.restoreWall(wall);
      }
    }
  }

  private fadeWall(wall: Mesh): void {
    if (this.fadedWalls.has(wall)) return;
    this.fadedWalls.add(wall);

    // Swap decoration meshes to pre-built faded material clones
    const decos = this.wallDecoMap.get(wall);
    if (decos) {
      for (const root of decos) {
        for (const child of root.getChildMeshes(false)) {
          if (!child.material) continue;
          let cached = this.decoMaterialCache.get(child);
          if (!cached) {
            const original = child.material;
            const faded = original.clone(`${original.name}_faded`);
            if (!faded) continue;
            faded.alpha = FADED_ALPHA;
            faded.transparencyMode = 2; // ALPHABLEND
            faded.backFaceCulling = false;
            cached = { original, faded };
            this.decoMaterialCache.set(child, cached);
          }
          child.material = cached.faded;
        }
      }
    }
  }

  private restoreWall(wall: Mesh): void {
    if (!this.fadedWalls.has(wall)) return;
    this.fadedWalls.delete(wall);

    const decos = this.wallDecoMap.get(wall);
    if (decos) {
      for (const root of decos) {
        for (const child of root.getChildMeshes(false)) {
          const cached = this.decoMaterialCache.get(child);
          if (cached) {
            child.material = cached.original;
          }
        }
      }
    }
  }

  dispose(): void {
    // Restore all faded walls to original materials before disposing
    for (const wall of this.fadedWalls) {
      const decos = this.wallDecoMap.get(wall);
      if (decos) {
        for (const root of decos) {
          for (const child of root.getChildMeshes(false)) {
            const cached = this.decoMaterialCache.get(child);
            if (cached) {
              child.material = cached.original;
            }
          }
        }
      }
    }
    this.fadedWalls.clear();

    // Dispose cloned faded materials
    for (const [, { faded }] of this.decoMaterialCache) {
      faded.dispose();
    }
    this.decoMaterialCache.clear();
  }
}
