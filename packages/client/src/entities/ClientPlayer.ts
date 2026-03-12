import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

const LERP_SPEED = 0.2;

export class ClientPlayer {
  public mesh: Mesh;
  public isLocal: boolean;

  // Target state from server
  private targetX: number = 0;
  private targetZ: number = 0;
  private targetRotY: number = 0;

  constructor(scene: Scene, isLocal: boolean, id: string) {
    this.isLocal = isLocal;

    this.mesh = MeshBuilder.CreateCylinder(
      `player_${id}`,
      { height: 1.4, diameterTop: 0.6, diameterBottom: 0.7, tessellation: 12 },
      scene,
    );

    const head = MeshBuilder.CreateSphere(
      `playerHead_${id}`,
      { diameter: 0.65, segments: 8 },
      scene,
    );
    head.position.y = 0.9;
    head.parent = this.mesh;

    const material = new StandardMaterial(`playerMat_${id}`, scene);
    if (isLocal) {
      material.diffuseColor = new Color3(0.2, 0.6, 0.9);
    } else {
      material.diffuseColor = new Color3(0.2, 0.9, 0.4);
    }
    material.specularColor = new Color3(0.3, 0.3, 0.3);
    this.mesh.material = material;
    head.material = material;

    this.mesh.position.y = 0.7;
  }

  /** Called when server state changes */
  setServerState(x: number, z: number, rotY: number): void {
    this.targetX = x;
    this.targetZ = z;
    this.targetRotY = rotY;
  }

  /** Snap position immediately (used on first spawn) */
  snapToPosition(x: number, z: number): void {
    this.mesh.position.x = x;
    this.mesh.position.z = z;
    this.targetX = x;
    this.targetZ = z;
  }

  /** Interpolate toward server state each frame */
  update(): void {
    this.mesh.position.x += (this.targetX - this.mesh.position.x) * LERP_SPEED;
    this.mesh.position.z += (this.targetZ - this.mesh.position.z) * LERP_SPEED;
    this.mesh.rotation.y = this.targetRotY;
  }

  getWorldPosition(): Vector3 {
    return this.mesh.position.clone();
  }

  dispose(): void {
    this.mesh.dispose();
  }
}
