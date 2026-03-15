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

export class WallOcclusionSystem {
  /** Original shared material + per-mesh faded clone */
  private decoMaterialCache: Map<AbstractMesh, { original: Material; faded: Material }> = new Map();
  /** Track which walls are currently faded */
  private fadedWalls: Set<Mesh> = new Set();
  private camera: ArcRotateCamera;
  /** Map from wall cap → decoration root nodes (faded with wall) */
  private wallDecoMap: Map<Mesh, TransformNode[]>;
  /** Spatial grid: cell key → walls in that cell */
  private grid: Map<number, Mesh[]> = new Map();

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

          if (distSq > OCCLUDE_RADIUS_SQ) {
            this.restoreWall(wall);
            continue;
          }

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
            this.fadeWall(wall);
          } else {
            this.restoreWall(wall);
          }
        }
      }
    }

    // Restore any faded walls that are no longer in nearby grid cells
    // (player moved away — these walls weren't visited in the loop above)
    for (const wall of this.fadedWalls) {
      const wcx = Math.floor(wall.position.x / GRID_CELL_SIZE);
      const wcz = Math.floor(wall.position.z / GRID_CELL_SIZE);
      if (Math.abs(wcx - pcx) > 1 || Math.abs(wcz - pcz) > 1) {
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
