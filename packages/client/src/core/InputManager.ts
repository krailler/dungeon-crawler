import type { Scene } from "@babylonjs/core/scene";
import type { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import type { Room } from "@colyseus/sdk";
import { MessageType } from "@dungeon/shared";

/** Min interval (ms) between MOVE messages while holding mouse */
const HOLD_SEND_INTERVAL = 150;

export class InputManager {
  private scene: Scene;
  private floorMeshSet: Set<AbstractMesh>;
  private room: Room;
  private isHolding: boolean = false;
  private lastSendTime: number = 0;

  constructor(scene: Scene, floorMeshes: AbstractMesh[], room: Room) {
    this.scene = scene;
    this.floorMeshSet = new Set(floorMeshes);
    this.room = room;

    const canvas = this.scene.getEngine().getRenderingCanvas()!;

    canvas.addEventListener("pointerdown", (ev) => {
      if (ev.button !== 0) return;
      this.isHolding = true;
      this.trySendMove();
    });

    canvas.addEventListener("pointerup", (ev) => {
      if (ev.button !== 0) return;
      this.isHolding = false;
    });

    canvas.addEventListener("pointerleave", () => {
      this.isHolding = false;
    });

    // While holding, continuously send move toward cursor
    this.scene.onBeforeRenderObservable.add(() => {
      if (!this.isHolding) return;
      const now = performance.now();
      if (now - this.lastSendTime < HOLD_SEND_INTERVAL) return;
      this.trySendMove();
    });
  }

  private trySendMove(): void {
    const pick = this.scene.pick(this.scene.pointerX, this.scene.pointerY);
    if (pick && pick.hit && pick.pickedPoint && pick.pickedMesh) {
      if (this.floorMeshSet.has(pick.pickedMesh)) {
        this.room.send(MessageType.MOVE, {
          x: pick.pickedPoint.x,
          z: pick.pickedPoint.z,
        });
        this.lastSendTime = performance.now();
      }
    }
  }
}
