import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import type { Material } from "@babylonjs/core/Materials/material";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

const OCCLUDE_RADIUS = 10;
const FADED_ALPHA = 0.12;

export class WallOcclusionSystem {
  private wallMeshes: Mesh[];
  /** Original shared material + per-mesh faded clone */
  private decoMaterialCache: Map<AbstractMesh, { original: Material; faded: Material }> = new Map();
  /** Track which walls are currently faded */
  private fadedWalls: Set<Mesh> = new Set();
  private camera: ArcRotateCamera;
  /** Map from wall cap → decoration root nodes (faded with wall) */
  private wallDecoMap: Map<Mesh, TransformNode[]>;

  constructor(
    _scene: Scene,
    camera: ArcRotateCamera,
    wallMeshes: Mesh[],
    wallDecoMap: Map<Mesh, TransformNode[]>,
  ) {
    this.camera = camera;
    this.wallMeshes = wallMeshes;
    this.wallDecoMap = wallDecoMap;
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

    for (const wall of this.wallMeshes) {
      const wx = wall.position.x - playerX;
      const wz = wall.position.z - playerZ;
      const dist = Math.sqrt(wx * wx + wz * wz);

      if (dist > OCCLUDE_RADIUS) {
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
}
