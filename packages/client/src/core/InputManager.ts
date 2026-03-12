import { PointerEventTypes } from "@babylonjs/core/Events/pointerEvents";
import type { Scene } from "@babylonjs/core/scene";
import type { Mesh } from "@babylonjs/core/Meshes/mesh";
import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";

export class InputManager {
  private scene: Scene;
  private floorMeshSet: Set<Mesh>;
  private room: Room;

  constructor(scene: Scene, floorMeshes: Mesh[], room: Room) {
    this.scene = scene;
    this.floorMeshSet = new Set(floorMeshes);
    this.room = room;

    this.scene.onPointerObservable.add((pointerInfo) => {
      if (
        pointerInfo.type === PointerEventTypes.POINTERTAP ||
        pointerInfo.type === PointerEventTypes.POINTERDOWN
      ) {
        const pickInfo = pointerInfo.pickInfo;
        if (pickInfo && pickInfo.hit && pickInfo.pickedPoint && pickInfo.pickedMesh) {
          if (this.floorMeshSet.has(pickInfo.pickedMesh as Mesh)) {
            // Send move command to server
            this.room.send(MessageType.MOVE, {
              x: pickInfo.pickedPoint.x,
              z: pickInfo.pickedPoint.z,
            });
          }
        }
      }
    });
  }
}
