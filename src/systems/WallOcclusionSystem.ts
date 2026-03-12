import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";

const OCCLUDE_RADIUS = 10;
const FADED_ALPHA = 0.12;

export class WallOcclusionSystem {
  private wallMeshes: Mesh[];
  private originalMaterials: Map<Mesh, StandardMaterial> = new Map();
  private fadedMaterial: StandardMaterial;
  private camera: ArcRotateCamera;

  constructor(scene: Scene, camera: ArcRotateCamera, wallMeshes: Mesh[]) {
    this.camera = camera;
    this.wallMeshes = wallMeshes;

    // Single shared material for all faded walls
    this.fadedMaterial = new StandardMaterial("wallFaded", scene);
    this.fadedMaterial.diffuseColor = new Color3(0.35, 0.3, 0.28);
    this.fadedMaterial.specularColor = new Color3(0.05, 0.05, 0.05);
    this.fadedMaterial.alpha = FADED_ALPHA;
    this.fadedMaterial.transparencyMode = 2; // ALPHABLEND
    this.fadedMaterial.backFaceCulling = false;
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

      if (dot < 0) {
        this.fadeWall(wall);
      } else {
        this.restoreWall(wall);
      }
    }
  }

  private fadeWall(wall: Mesh): void {
    if (wall.material === this.fadedMaterial) return;

    const currentMat = wall.material as StandardMaterial;
    if (!currentMat) return;

    if (!this.originalMaterials.has(wall)) {
      this.originalMaterials.set(wall, currentMat);
    }

    wall.material = this.fadedMaterial;
  }

  private restoreWall(wall: Mesh): void {
    const origMat = this.originalMaterials.get(wall);
    if (origMat && wall.material !== origMat) {
      wall.material = origMat;
    }
  }
}
