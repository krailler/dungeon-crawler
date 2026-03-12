import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";

export class InputManager {
  public targetPosition: Vector3 | null = null;
  public hasNewTarget: boolean = false;

  private scene: Scene;
  private floorMeshSet: Set<Mesh>;

  constructor(scene: Scene, floorMeshes: Mesh[]) {
    this.scene = scene;
    this.floorMeshSet = new Set(floorMeshes);

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (
        pointerInfo.type === PointerEventTypes.POINTERTAP ||
        pointerInfo.type === PointerEventTypes.POINTERDOWN
      ) {
        const pickInfo = pointerInfo.pickInfo;
        if (pickInfo && pickInfo.hit && pickInfo.pickedPoint && pickInfo.pickedMesh) {
          if (this.floorMeshSet.has(pickInfo.pickedMesh as Mesh)) {
            this.targetPosition = pickInfo.pickedPoint.clone();
            this.targetPosition.y = 0;
            this.hasNewTarget = true;
          }
        }
      }
    });
  }

  consumeTarget(): Vector3 | null {
    if (this.hasNewTarget && this.targetPosition) {
      this.hasNewTarget = false;
      return this.targetPosition;
    }
    return null;
  }
}
